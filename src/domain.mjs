import { randomUUID } from 'node:crypto';
import {
  check,
  text,
  integer,
  date,
  now,
  overlaps,
  activeApplication,
  activeBooking,
  cellFor,
} from './common.mjs';
import { routeFits } from './routing.mjs';

export class Domain {
  constructor(store, adapters = { route: () => ({ minutes: null, returnMinutes: null, distance: null }) }) {
    this.s = store;
    this.adapters = adapters;
  }
  actor(u, role) {
    check(u, '请先登录', 401);
    check(!role || u.role === role, '当前身份不能执行此操作', 403);
    check(u.profileComplete, '请先完善基础资料', 409);
  }
  own(kind, id, u) {
    const item = this.s.get(kind, id);
    check(item, '记录不存在', 404);
    check(item.owner === u.id, '无权操作其他机构的记录', 403);
    return item;
  }
  notify(userId, title, target) {
    this.s.put('notice', { owner: userId, title, target, read: false });
  }
  audit(u, ref, action, before, after, reason = '') {
    this.s.put('audit', { owner: u.id, ref, action, before, after, reason });
  }
  profile(u, b) {
    const next = {
      ...u,
      name: text(b.name, '姓名／机构名称', 80),
      region: text(b.region, '常用服务区域', 100),
      skills: text(b.skills || '', '擅长服务', 200, false),
      contactPhone: text(b.contactPhone ?? u.contactPhone ?? u.phone, '联系电话', 30),
      contact: text(b.contact || '', '联系人', 80, u.role === 'requester'),
      address: text(b.address || '', '机构地址', 200, u.role === 'requester'),
      profileComplete: true,
    };
    if (b.settings) {
      check(['normal', 'large'].includes(b.settings.fontSize), '文字大小设置无效');
      next.settings = { fontSize: b.settings.fontSize, notifications: b.settings.notifications !== false };
    }
    check(/^[+\d][\d\s()-]{5,29}$/.test(next.contactPhone), '请填写有效的联系电话');
    return this.s.saveUser(next);
  }
  apps(taskId) {
    return this.s.all('application').filter((a) => a.taskId === taskId);
  }
  bookings(taskId) {
    return this.s.all('booking').filter((b) => b.taskId === taskId);
  }
  taskData(u, b, old) {
    const kind = old?.kind || b.kind;
    check(['help', 'redeem'].includes(kind), '需求类型错误');
    const status = b.status || old?.status || 'draft';
    check(['draft', 'published', 'paused'].includes(status), '请通过取消操作结束需求');
    const draft = status === 'draft';
    const t = {
      ...(old || {}),
      owner: u.id,
      kind,
      title: text(b.title, '标题', 100, !draft),
      category: text(b.category || '陪伴交流', '服务类型', 30),
      description: text(b.description, '服务内容', 3000, !draft),
      recipient: text(b.recipient, '受助对象或适用人群', 300, !draft),
      region: text(b.region || u.region, '服务区域', 100, !draft),
      address: text(b.address, '详细服务地址', 300, !draft),
      meeting: text(b.meeting || '', '集合与到达说明', 500, false),
      contact: text(b.contact || u.contact || u.name, '联系人', 80, !draft),
      phone: text(b.phone || u.phone, '联系电话', 30, !draft),
      requirements: text(b.requirements || '', '能力与注意事项', 500, false),
      start: date(b.start || new Date(Date.now() + 86400000), '开始时间'),
      end: date(b.end || new Date(Date.now() + 90000000), '结束时间'),
      deadline: date(b.deadline || b.start || new Date(Date.now() + 86400000), '报名截止时间'),
      capacity: integer(b.capacity || 1, '人数／名额', 1, 200),
      minutes: integer(b.minutes || 60, '服务或兑换分钟数', 1, 1440),
      recipients: integer(b.recipients || 1, '预计受助人数', 1, 10000),
      status,
    };
    check(t.end > t.start, '结束时间必须晚于开始时间');
    check(t.deadline <= t.start, '报名截止时间不得晚于开始时间');
    if (!draft && !old) {
      check(t.start > now(), '新发布服务时间必须晚于当前时间');
      check(t.deadline > now(), '新发布服务的报名截止时间必须晚于当前时间');
    }
    if (kind === 'help')
      check(t.minutes <= (Date.parse(t.end) - Date.parse(t.start)) / 60000, '有效时长不能超过服务时间段');
    const lat = b.lat === '' || b.lat === null || b.lat === undefined ? null : Number(b.lat),
      lng = b.lng === '' || b.lng === null || b.lng === undefined ? null : Number(b.lng);
    check(
      (lat === null && lng === null) ||
        (Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          lat >= -85 &&
          lat <= 85 &&
          lng >= -180 &&
          lng <= 180),
      '请同时填写有效经纬度，或同时留空',
    );
    t.lat = lat;
    t.lng = lng;
    t.cell = lat === null ? null : cellFor(lat, lng);
    return t;
  }
  createTask(u, b) {
    this.actor(u, 'requester');
    const t = this.taskData(u, b);
    t.revision = 1;
    this.s.put('task', t);
    this.audit(u, t.id, 'create', null, t);
    return this.taskView(u, t);
  }
  saveTask(u, id, b) {
    this.actor(u, 'requester');
    const old = this.own('task', id, u);
    check(old.status !== 'cancelled', '已取消需求请复制后重新发布', 409);
    check(!old.pending, '请先完成已有变更确认', 409);
    check(Number(b.revision) === old.revision, '内容已更新，请刷新后重新编辑', 409);
    const t = this.taskData(u, b, old);
    check(old.status === 'draft' || t.status === old.status, '请使用暂停或取消操作管理已发布需求', 409);
    const occupied =
      old.kind === 'help'
        ? this.apps(id).filter(activeApplication).length
        : this.bookings(id).filter(activeBooking).length;
    check(t.capacity >= occupied, '名额不能少于已确认或预约人数');
    const keys = ['title', 'description', 'start', 'end', 'address', 'meeting', 'lat', 'lng', 'minutes'];
    const core = keys.some((k) => t[k] !== old[k]);
    if (core) {
      const participants =
        old.kind === 'help'
          ? this.apps(id).filter((a) =>
              ['accepted', 'checked_in', 'submitted', 'disputed', 'confirmed'].includes(a.status),
            )
          : this.bookings(id).filter(activeBooking);
      check(
        !participants.some((a) =>
          old.kind === 'help' ? a.status !== 'accepted' : !['pending', 'accepted'].includes(a.status),
        ),
        '服务已经开始或完成，不能修改核心内容，请通过记录更正处理',
        409,
      );
      if (participants.length) {
        old.pending = {
          proposed: t,
          answers: Object.fromEntries(participants.map((a) => [a.id, 'pending'])),
        };
        old.revision++;
        this.s.put('task', old);
        participants.forEach((a) => this.notify(a.userId, '服务安排有变更，请确认', `task/${id}`));
        return this.taskView(u, old);
      }
    }
    t.revision = old.revision + 1;
    this.s.put('task', t);
    this.audit(u, id, 'edit', old, t);
    return this.taskView(u, t);
  }
  taskAction(u, id, b) {
    this.actor(u, 'requester');
    const t = this.own('task', id, u);
    if (b.action === 'location') {
      check(
        !this.apps(id).some((a) => ['accepted', 'checked_in', 'submitted', 'disputed'].includes(a.status)) &&
          !this.bookings(id).some((b) => !['completed', 'cancelled', 'rejected'].includes(b.status)),
        '服务进行期间请通过编辑安排变更地点，完成后再更正成果地点',
        409,
      );
      check(!t.pending, '安排变更期间请稍后修正地点', 409);
      const lat = Number(b.lat),
        lng = Number(b.lng);
      check(
        b.lat !== '' &&
          b.lng !== '' &&
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          Math.abs(lat) <= 85 &&
          Math.abs(lng) <= 180,
        '请填写有效经纬度',
      );
      const before = { ...t },
        reason = text(b.reason, '地点核实依据', 1000);
      Object.assign(t, { lat, lng, cell: cellFor(lat, lng), revision: t.revision + 1 });
      this.s.put('task', t);
      for (const booking of this.bookings(id)) {
        Object.assign(booking, { lat, lng, cell: t.cell });
        this.s.put('booking', booking);
      }
      this.audit(u, id, 'location', before, t, reason);
      return this.taskView(u, t);
    }
    if (b.action === 'copy') {
      const copy = {
        ...t,
        ...b,
        start: b.start || new Date(Date.now() + 86400000).toISOString(),
        end: b.end || new Date(Date.now() + 90000000).toISOString(),
        deadline: b.start || new Date(Date.now() + 86400000).toISOString(),
        status: 'draft',
      };
      delete copy.id;
      delete copy.pending;
      delete copy.created;
      delete copy.updated;
      copy.revision = 1;
      return this.createTask(u, copy);
    }
    if (b.action === 'cancel') {
      if (t.status === 'cancelled') return this.taskView(u, t);
      const reason = text(b.reason, '取消原因', 500);
      t.status = 'cancelled';
      t.cancelReason = reason;
      delete t.pending;
      t.revision++;
      this.s.put('task', t);
      for (const a of this.apps(id)) {
        if (['pending', 'accepted'].includes(a.status)) {
          a.wasAccepted = a.status === 'accepted';
          a.status = 'cancelled';
          a.reason = reason;
          this.s.put('application', a);
        }
        this.notify(a.userId, '帮扶需求已取消，已发生部分仍可提交核实', `task/${id}`);
      }
      for (const bk of this.bookings(id))
        if (['pending', 'accepted', 'reschedule'].includes(bk.status)) this.cancelBooking(u, bk, { reason });
      this.audit(u, id, 'cancel', null, t, reason);
      return this.taskView(u, t);
    }
    check(['pause', 'resume', 'publish'].includes(b.action), '未知操作');
    check(t.status !== 'cancelled', '已取消需求不能恢复');
    if (['publish', 'resume'].includes(b.action)) {
      check(t.start > now(), '服务时间已过，请先编辑');
      check(t.deadline > now(), '报名截止时间已过，请先编辑');
      this.taskData(u, { ...t, status: 'published' }, t);
    }
    t.status = b.action === 'pause' ? 'paused' : 'published';
    t.revision++;
    this.s.put('task', t);
    return this.taskView(u, t);
  }
  conflict(userId, start, end, excludeTask) {
    return (
      this.s.all('application').some(
        (a) =>
          a.userId === userId &&
          activeApplication(a) &&
          a.taskId !== excludeTask &&
          (() => {
            const t = this.s.get('task', a.taskId);
            return overlaps(start, end, t.start, t.end);
          })(),
      ) ||
      this.s
        .all('booking')
        .some(
          (b) =>
            b.userId === userId &&
            ['pending', 'accepted', 'reschedule', 'result_pending', 'disputed'].includes(b.status) &&
            b.taskId !== excludeTask &&
            overlaps(start, end, b.start, b.end),
        )
    );
  }
  apply(u, id, b) {
    this.actor(u, 'volunteer');
    const t = this.s.get('task', id);
    check(t && t.kind === 'help' && t.status === 'published', '需求不可报名', 409);
    check(t.deadline > now(), '报名已截止', 409);
    check(!t.pending, '需求安排变更中，请稍后报名', 409);
    const existing = this.apps(id).find((a) => a.userId === u.id);
    if (existing && !['withdrawn', 'rejected'].includes(existing.status))
      return this.applicationView(u, existing);
    check(this.apps(id).filter(activeApplication).length < t.capacity, '名额已满', 409);
    check(!this.conflict(u.id, t.start, t.end, id), '与已确认安排时间冲突', 409);
    const a = this.s.put('application', {
      id: `${id}_${u.id}`,
      owner: t.owner,
      userId: u.id,
      taskId: id,
      status: 'pending',
      message: text(b.message || '', '报名留言', 500, false),
    });
    this.notify(t.owner, '收到新的志愿报名', `task/${id}`);
    return this.applicationView(u, a);
  }
  applicationView(u, a) {
    return {
      ...a,
      volunteer: { id: a.userId, name: this.s.user(a.userId)?.name, skills: this.s.user(a.userId)?.skills },
      record: this.s.get('record', a.id) || null,
    };
  }
  applicationAction(u, id, b) {
    this.actor(u);
    const a = this.s.get('application', id);
    check(a, '报名不存在', 404);
    const t = this.s.get('task', a.taskId);
    check(a.userId === u.id || t.owner === u.id, '无权访问', 403);
    if (b.action === 'request-change') {
      check(a.userId === u.id, '仅本人可申请调整时间', 403);
      check(a.status === 'accepted' && t.status !== 'cancelled' && !t.pending, '当前不能申请调整时间', 409);
      check(!a.changeRequest, '已有待处理的时间调整申请', 409);
      const start = date(b.start, '建议开始时间'), end = date(b.end, '建议结束时间');
      check(start > now() && end > start, '建议时间应在未来，且结束时间晚于开始时间');
      check(t.minutes <= (Date.parse(end) - Date.parse(start)) / 60000, '建议时间段不能短于服务时长');
      check(start !== t.start || end !== t.end, '建议时间与原安排相同');
      check(!this.conflict(a.userId, start, end, t.id), '建议时间与已有服务冲突', 409);
      a.changeRequest = { start, end, reason: text(b.reason, '调整原因', 500), created: now() };
      delete a.changeResolution;
      this.s.put('application', a);
      this.notify(t.owner, '志愿者申请调整服务时间，请确认', `task/${t.id}/changes`);
      this.audit(u, a.id, 'request-change', null, a.changeRequest);
    } else if (['accept-request-change', 'reject-request-change'].includes(b.action)) {
      check(t.owner === u.id, '仅需求方可处理时间调整申请', 403);
      if (!a.changeRequest && a.changeResolution?.action === b.action) return this.applicationView(u, a);
      check(a.status === 'accepted' && a.changeRequest && t.status !== 'cancelled', '时间调整申请已失效', 409);
      const requested = a.changeRequest;
      const reason = text(b.reason || '', '处理说明', 500, b.action === 'reject-request-change');
      if (b.action === 'accept-request-change') {
        check(requested.start > now(), '建议时间已过，请联系志愿者重新申请', 409);
        check(!this.conflict(a.userId, requested.start, requested.end, t.id), '志愿者已有时间冲突', 409);
        this.saveTask(u, t.id, { ...t, start: requested.start, end: requested.end, deadline: t.deadline > requested.start ? requested.start : t.deadline });
        // The applicant explicitly proposed these times. Other accepted volunteers
        // must still confirm through the existing arrangement-change workflow.
        const changing = this.s.get('task', t.id);
        this.settleTaskChange(changing, a.id, 'accepted');
      }
      a.changeResolution = { action: b.action, reason, requested, handled: now() };
      delete a.changeRequest;
      this.s.put('application', a);
      this.audit(u, a.id, b.action, requested, a.changeResolution, reason);
      this.notify(a.userId, b.action === 'accept-request-change' ? '时间调整已同意，请查看服务安排' : '时间调整未通过，请查看处理说明', `task/${t.id}/arrangement`);
    } else if (b.action === 'handle-withdrawal') {
      check(t.owner === u.id, '仅需求方可处理人员退出', 403);
      check(a.status === 'withdrawn' && a.wasAccepted, '没有待处理的人员退出', 409);
      if (a.withdrawalHandled) return this.applicationView(u, a);
      a.withdrawalHandled = { reason: text(b.reason, '人员安排说明', 500), handled: now() };
      this.s.put('application', a);
      this.audit(u, a.id, 'handle-withdrawal', null, a.withdrawalHandled);
    } else if (b.action === 'accept' || b.action === 'reject') {
      check(t.owner === u.id, '仅需求方可确认人员', 403);
      const dest = b.action === 'accept' ? 'accepted' : 'rejected';
      if (a.status === dest) return this.applicationView(u, a);
      check(a.status === 'pending', '报名状态已变化', 409);
      if (dest === 'accepted') {
        check(t.status === 'published' && !t.pending && t.start > now(), '当前需求不能确认报名', 409);
        check(this.apps(t.id).filter(activeApplication).length < t.capacity, '名额已满', 409);
        check(!this.conflict(a.userId, t.start, t.end, t.id), '志愿者已有时间冲突', 409);
      }
      a.status = dest;
      if (dest === 'accepted') a.wasAccepted = true;
      a.reason = text(b.reason || '', '处理说明', 500, false);
      this.s.put('application', a);
      this.notify(a.userId, dest === 'accepted' ? '报名已通过，请查看安排' : '报名未通过', `task/${t.id}`);
    } else if (b.action === 'withdraw') {
      check(a.userId === u.id, '仅本人可退出', 403);
      if (a.status === 'withdrawn') return this.applicationView(u, a);
      check(['pending', 'accepted'].includes(a.status), '已开始服务请提交实际记录', 409);
      a.reason = text(b.reason, '退出原因', 500);
      a.status = 'withdrawn';
      delete a.changeRequest;
      this.s.put('application', a);
      this.notify(t.owner, '志愿者退出，请调整人员安排', `task/${t.id}`);
      this.settleTaskChange(t, a.id, 'declined');
    } else if (b.action === 'checkin') {
      check(a.userId === u.id, '仅本人可签到', 403);
      if (a.status === 'checked_in') return this.applicationView(u, a);
      check(a.status === 'accepted' && t.status !== 'cancelled' && !t.pending, '当前不能签到', 409);
      check(
        Date.now() >= Date.parse(t.start) - 3600000 && Date.now() <= Date.parse(t.end) + 86400000,
        '不在签到时间范围，可使用补录说明',
        409,
      );
      a.checkin = now();
      a.status = 'checked_in';
      a.checkinNote = text(b.note || '定位未接入，使用人工核实', '签到说明', 500);
      this.s.put('application', a);
    } else if (b.action === 'submit') {
      check(a.userId === u.id, '仅本人可提交记录', 403);
      if (['submitted', 'confirmed'].includes(a.status)) return this.applicationView(u, a);
      check(
        ['accepted', 'checked_in', 'disputed'].includes(a.status) ||
          (a.status === 'cancelled' && a.wasAccepted),
        '当前不能提交记录',
        409,
      );
      check(!t.pending, '请先确认安排变更', 409);
      const start = date(b.start, '实际开始时间'),
        end = date(b.end, '实际结束时间'),
        rest = integer(b.rest || 0, '休息分钟', 0, 1440);
      const duration = Math.floor((Date.parse(end) - Date.parse(start)) / 60000) - rest;
      check(duration >= 0 && duration <= 1440, '有效服务时间不合理');
      check(Date.parse(end) <= Date.now() + 60000, '不能提前提交未来服务');
      check(
        Date.parse(start) >= Date.parse(t.start) - 86400000 &&
          Date.parse(end) <= Date.parse(t.end) + 86400000,
        '实际时间偏离约定超过一天，请先更正安排',
      );
      if (a.status === 'cancelled') check(end <= t.updated, '取消后未开展的服务不能补录');
      const note = text(b.note || '', '补录说明', 500, !a.checkin);
      const record = this.s.get('record', id) || {
        id,
        owner: t.owner,
        userId: u.id,
        taskId: t.id,
        confirmed: 0,
        status: 'submitted',
        revision: 0,
      };
      check(record.status !== 'confirmed', '已确认记录通过更正处理', 409);
      Object.assign(record, {
        start,
        end,
        rest,
        submitted: duration,
        content: text(b.content, '实际服务内容', 2000),
        note,
        status: 'submitted',
      });
      this.s.put('record', record);
      a.status = 'submitted';
      this.s.put('application', a);
      this.notify(t.owner, '服务记录已提交，请核实', `task/${t.id}`);
    } else if (b.action === 'change') {
      check(a.userId === u.id && t.pending?.answers[a.id] === 'pending', '没有待确认变更', 409);
      check(['accept', 'decline'].includes(b.answer), '请选择确认或退出');
      if (b.answer === 'accept')
        check(
          !this.conflict(u.id, t.pending.proposed.start, t.pending.proposed.end, t.id),
          '新安排与已有服务冲突',
          409,
        );
      if (b.answer === 'decline') {
        a.status = 'withdrawn';
        a.reason = '不同意新安排';
        this.s.put('application', a);
      }
      this.settleTaskChange(t, a.id, b.answer === 'accept' ? 'accepted' : 'declined');
    } else check(false, '未知报名操作');
    return this.applicationView(u, a);
  }
  settleTaskChange(t, id, answer) {
    if (!t.pending?.answers[id]) return;
    t.pending.answers[id] = answer;
    if (!Object.values(t.pending.answers).includes('pending')) {
      const next = { ...t.pending.proposed, id: t.id, revision: t.revision + 1 };
      delete next.pending;
      this.s.put('task', next);
      for (const a of this.apps(t.id).filter(activeApplication))
        this.notify(a.userId, '新的服务安排已生效', `task/${t.id}`);
      for (const b of this.bookings(t.id).filter(activeBooking)) {
        Object.assign(b, { start: next.start, end: next.end });
        this.s.put('booking', b);
        this.notify(b.userId, '兑换项目新安排已生效', `booking/${b.id}`);
      }
    } else this.s.put('task', t);
  }
  postLedger(userId, orgId, minutes, kind, ref, taskId, note) {
    this.s.db
      .prepare('INSERT INTO ledger VALUES (?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), userId, orgId, minutes, kind, ref, taskId, note, now());
  }
  recordAction(u, id, b) {
    this.actor(u);
    const r = this.s.get('record', id);
    check(r, '服务记录不存在', 404);
    check(r.owner === u.id || r.userId === u.id, '无权访问', 403);
    const a = this.s.get('application', id);
    if (b.action === 'dispute') {
      check(r.userId === u.id, '仅参与者可提出异议', 403);
      if (r.status === 'disputed') return r;
      r.dispute = text(b.reason, '异议说明', 1000);
      r.status = 'disputed';
      a.status = 'disputed';
      this.notify(r.owner, '收到服务结果异议', `task/${r.taskId}`);
    } else {
      check(r.owner === u.id, '仅需求方可核实记录', 403);
      check(['confirm', 'correct', 'resolve', 'revoke'].includes(b.action), '未知核实操作');
      if (b.action === 'confirm' && r.status === 'confirmed') return r;
      check(b.action !== 'confirm' || r.status === 'submitted', '请通过异议处理或更正操作处理', 409);
      check(b.action !== 'resolve' || r.status === 'disputed', '当前记录没有待处理异议', 409);
      check(
        b.action !== 'correct' || ['confirmed', 'revoked'].includes(r.status),
        '当前状态请使用核实或异议处理',
        409,
      );
      const minutes = b.action === 'revoke' ? 0 : integer(b.minutes, '确认分钟数', 0, r.submitted);
      const recipients = integer(b.recipients || 0, '实际受助人次', 0, 10000);
      check(!minutes || recipients > 0, '有有效服务时长时须确认实际受助人次');
      const reason = text(
        b.reason || '',
        '核实／更正说明',
        1000,
        b.action !== 'confirm' || minutes !== r.submitted,
      );
      const before = { ...r };
      const delta = minutes - (r.confirmed || 0);
      r.revision++;
      if (delta)
        this.postLedger(
          r.userId,
          r.owner,
          delta,
          r.revision === 1 ? 'credit' : 'correction',
          `record:${id}:${r.revision}`,
          r.taskId,
          reason || '服务已确认',
        );
      Object.assign(r, {
        confirmed: minutes,
        recipients,
        status: b.action === 'revoke' ? 'revoked' : 'confirmed',
        reason,
        confirmedAt: now(),
      });
      a.status = r.status === 'revoked' ? 'revoked' : 'confirmed';
      this.audit(u, id, b.action, before, r, reason);
      this.notify(
        r.userId,
        delta >= 0 ? '服务结果已确认，查看时长与爱心足迹' : '服务记录已更正，请查看账户变动',
        `task/${r.taskId}`,
      );
    }
    this.s.put('record', r);
    this.s.put('application', a);
    return r;
  }
  account(userId, orgId) {
    const total = this.s.db
      .prepare('SELECT COALESCE(SUM(minutes),0) n FROM ledger WHERE user_id=? AND org_id=?')
      .get(userId, orgId).n;
    const held = this.s
      .all('booking')
      .filter(
        (b) =>
          b.userId === userId &&
          b.owner === orgId &&
          !['completed', 'cancelled', 'rejected'].includes(b.status),
      )
      .reduce((n, b) => n + b.held, 0);
    const contributed = this.s
      .all('record')
      .filter((r) => r.userId === userId && r.owner === orgId)
      .reduce((n, r) => n + (r.confirmed || 0), 0);
    const pending = this.s
      .all('record')
      .filter((r) => r.userId === userId && r.owner === orgId && ['submitted', 'disputed'].includes(r.status))
      .reduce((n, r) => n + Math.max(0, r.submitted - r.confirmed), 0);
    const disputed = this.s
      .all('record')
      .filter((r) => r.userId === userId && r.owner === orgId && ['disputed', 'submitted'].includes(r.status))
      .reduce((n, r) => n + r.confirmed, 0);
    return {
      orgId,
      orgName: this.s.user(orgId)?.name,
      available: Math.max(0, total - held - disputed),
      debt: Math.max(0, held - total),
      held,
      disputed,
      contributed,
      pending,
      used: this.s
        .all('booking')
        .filter((b) => b.userId === userId && b.owner === orgId && b.status === 'completed')
        .reduce((n, b) => n + b.charged, 0),
    };
  }
  book(u, id, b) {
    this.actor(u, 'volunteer');
    const t = this.s.get('task', id);
    check(
      t &&
        t.kind === 'redeem' &&
        t.status === 'published' &&
        !t.pending &&
        t.start > now() &&
        t.deadline > now(),
      '兑换项目不可预约',
      409,
    );
    check(b.consent === true, '请确认已获得受助者同意');
    const duplicate = this.bookings(id).find((x) => x.userId === u.id && activeBooking(x));
    if (duplicate) return this.bookingView(u, duplicate);
    check(this.bookings(id).filter(activeBooking).length < t.capacity, '预约名额已满', 409);
    check(this.account(u.id, t.owner).available >= t.minutes, '对应机构可用时间不足', 409);
    check(!this.conflict(u.id, t.start, t.end, id), '与已有安排时间冲突', 409);
    const bk = this.s.put('booking', {
      owner: t.owner,
      userId: u.id,
      taskId: id,
      title: t.title,
      region: t.region,
      address: t.address,
      lat: t.lat,
      lng: t.lng,
      cell: t.cell,
      start: t.start,
      end: t.end,
      held: t.minutes,
      status: 'pending',
      recipient: text(b.recipient, '受助对象', 100),
      phone: text(b.phone, '联系电话', 30),
      needs: text(b.needs || '', '服务需要', 1000, false),
      consent: true,
      charged: 0,
    });
    this.notify(t.owner, '收到新的兑换预约', `booking/${bk.id}`);
    return this.bookingView(u, bk);
  }
  bookingView(u, b) {
    return { ...b, applicant: this.s.user(b.userId)?.name, orgName: this.s.user(b.owner)?.name };
  }
  cancelBooking(u, bk, b) {
    if (['cancelled', 'rejected'].includes(bk.status)) return bk;
    check(
      ['pending', 'accepted', 'reschedule'].includes(bk.status),
      '服务已发生，请核实实际完成部分后结算',
      409,
    );
    const reason = text(b.reason, '取消原因', 500);
    bk.status = 'cancelled';
    bk.reason = reason;
    bk.released = bk.held;
    bk.releasedAt = now();
    bk.held = 0;
    delete bk.change;
    this.s.put('booking', bk);
    this.notify(u.id === bk.owner ? bk.userId : bk.owner, '兑换预约取消，占用已释放', `booking/${bk.id}`);
    return bk;
  }
  bookingAction(u, id, b) {
    this.actor(u);
    const bk = this.s.get('booking', id);
    check(bk, '预约不存在', 404);
    check([bk.owner, bk.userId].includes(u.id), '无权访问该预约', 403);
    const org = u.id === bk.owner;
    const t = this.s.get('task', bk.taskId);
    const before = structuredClone(bk);
    if (b.action === 'cancel') {
      this.cancelBooking(u, bk, b);
      this.settleTaskChange(t, bk.id, 'declined');
      this.audit(u, id, 'cancel', before, bk, b.reason);
      return this.bookingView(u, bk);
    }
    if (b.action === 'accept') {
      check(org, '仅需求方可接受预约', 403);
      if (bk.status === 'accepted') return this.bookingView(u, bk);
      check(bk.status === 'pending' && !t.pending, '当前状态不能接受预约', 409);
      bk.status = 'accepted';
    } else if (b.action === 'reschedule') {
      check(['pending', 'accepted'].includes(bk.status) && !t.pending, '当前不能改约', 409);
      const start = date(b.start, '新开始时间'),
        end = date(b.end, '新结束时间');
      check(end > start && start > now(), '新的预约时间无效');
      check(!this.conflict(bk.userId, start, end, t.id), '新时间与已有安排冲突', 409);
      bk.change = {
        start,
        end,
        by: u.id,
        reason: text(b.reason, '改约原因', 500),
        previousStatus: bk.status,
      };
      bk.status = 'reschedule';
    } else if (b.action === 'respond') {
      check(bk.status === 'reschedule' && bk.change.by !== u.id, '仅另一方可确认改约', 403);
      check(['accept', 'decline'].includes(b.answer), '请确认或拒绝');
      if (b.answer === 'accept') {
        check(!this.conflict(bk.userId, bk.change.start, bk.change.end, t.id), '新时间与其他安排冲突', 409);
        bk.start = bk.change.start;
        bk.end = bk.change.end;
      }
      bk.status = bk.change.previousStatus;
      delete bk.change;
    } else if (b.action === 'task-change') {
      check(!org && t.pending?.answers[id] === 'pending', '没有待确认的项目变更', 409);
      check(['accept', 'decline'].includes(b.answer), '请选择确认或取消');
      if (b.answer === 'decline') this.cancelBooking(u, bk, { reason: '不同意项目变更' });
      else {
        const proposed = t.pending.proposed;
        check(!this.conflict(u.id, proposed.start, proposed.end, t.id), '新时间冲突', 409);
        const extra = proposed.minutes - bk.held;
        check(extra <= 0 || this.account(u.id, bk.owner).available >= extra, '变更后可用时间不足');
        bk.held = proposed.minutes;
        this.s.put('booking', bk);
      }
      this.settleTaskChange(t, id, b.answer === 'accept' ? 'accepted' : 'declined');
      return this.bookingView(u, this.s.get('booking', id));
    } else if (b.action === 'result') {
      check(org, '仅需求方提交履约结果', 403);
      check(['accepted', 'disputed'].includes(bk.status), '当前不能提交履约结果', 409);
      check(!t.pending, '请先完成项目变更确认', 409);
      check(Date.parse(bk.start) <= Date.now(), '不能提前确认尚未开始的服务');
      const minutes = integer(b.minutes, '拟结算分钟', 0, 1440);
      check(minutes <= bk.held, '追加时长须先由申请人确认增加占用');
      bk.result = {
        minutes,
        content: text(b.content, '实际履约内容', 2000),
        recipients: integer(b.recipients || 1, '实际受助人次', 1, 10000),
      };
      bk.status = 'result_pending';
    } else if (b.action === 'extra') {
      check(org && bk.status === 'accepted' && !bk.extra, '当前不能提出追加服务或已有待确认申请', 409);
      bk.extra = {
        minutes: integer(b.minutes, '追加分钟', 1, 1440),
        reason: text(b.reason, '追加服务说明', 500),
      };
    } else if (b.action === 'extra-response') {
      check(!org && bk.extra && bk.status === 'accepted', '没有待确认的追加服务', 409);
      check(['accept', 'decline'].includes(b.answer), '请选择同意或拒绝');
      if (b.answer === 'accept') {
        check(this.account(u.id, bk.owner).available >= bk.extra.minutes, '余额不足');
        bk.held += bk.extra.minutes;
      }
      delete bk.extra;
    } else if (b.action === 'complete') {
      check(!org, '仅申请人确认实际结果', 403);
      if (bk.status === 'completed') return this.bookingView(u, bk);
      check(bk.status === 'result_pending', '没有待确认结果', 409);
      bk.charged = bk.result.minutes;
      if (bk.charged)
        this.postLedger(bk.userId, bk.owner, -bk.charged, 'redeem', `booking:${id}`, t.id, '兑换服务已完成');
      bk.held = 0;
      bk.status = 'completed';
      bk.completedAt = now();
    } else if (b.action === 'dispute') {
      check(!org && ['result_pending', 'completed'].includes(bk.status), '当前不能提出异议', 409);
      check(bk.status !== 'completed', '已结算服务请发起更正申请', 409);
      bk.dispute = text(b.reason, '异议说明', 1000);
      bk.status = 'disputed';
    } else if (b.action === 'correction') {
      check(bk.status === 'completed' && !bk.correction, '仅已完成且无待处理更正的兑换可申请', 409);
      bk.correction = {
        by: u.id,
        minutes: integer(b.minutes, '更正后扣除分钟', 0, bk.charged),
        reason: text(b.reason, '更正原因', 1000),
      };
    } else if (b.action === 'correction-response') {
      check(bk.correction && bk.correction.by !== u.id, '仅另一方确认更正', 403);
      check(['accept', 'decline'].includes(b.answer), '请选择确认或拒绝');
      if (b.answer === 'accept') {
        const delta = bk.charged - bk.correction.minutes;
        bk.correctionRevision = (bk.correctionRevision || 0) + 1;
        if (delta)
          this.postLedger(
            bk.userId,
            bk.owner,
            delta,
            'refund',
            `booking:${id}:correct:${bk.correctionRevision}`,
            t.id,
            bk.correction.reason,
          );
        bk.charged = bk.correction.minutes;
      }
      this.audit(u, id, 'booking-correction', null, bk, bk.correction.reason);
      delete bk.correction;
    } else check(false, '未知预约操作');
    this.s.put('booking', bk);
    this.audit(u, id, b.action, before, bk, b.reason || '');
    this.notify(org ? bk.userId : bk.owner, '兑换预约状态已更新', `booking/${id}`);
    return this.bookingView(u, bk);
  }
  taskView(u, t) {
    const mine = u?.id === t.owner,
      apps = this.apps(t.id),
      self = apps.find((a) => a.userId === u?.id),
      hasBooking = this.bookings(t.id).some((b) => b.userId === u?.id && activeBooking(b));
    const full = mine || (self && (activeApplication(self) || self.wasAccepted)) || hasBooking;
    const participants = t.kind === 'help' ? apps : this.bookings(t.id);
    const displayStatus = ['draft', 'paused', 'cancelled'].includes(t.status)
      ? t.status
      : participants.some((a) => ['checked_in', 'submitted', 'disputed', 'result_pending'].includes(a.status))
        ? 'in_progress'
        : participants.some((a) => ['confirmed', 'completed'].includes(a.status)) &&
            participants.every((a) =>
              ['confirmed', 'completed', 'cancelled', 'withdrawn', 'rejected', 'revoked'].includes(a.status),
            )
          ? 'completed'
          : t.end < now()
            ? 'ended'
            : t.status;
    const view = {
      ...t,
      displayStatus,
      orgName: this.s.user(t.owner)?.name,
      remaining: Math.max(
        0,
        t.capacity -
          (t.kind === 'help'
            ? apps.filter(activeApplication).length
            : this.bookings(t.id).filter(activeBooking).length),
      ),
      mine,
      application: self ? this.applicationView(u, self) : null,
      applications: mine ? apps.map((a) => this.applicationView(u, a)) : [],
      bookings: mine ? this.bookings(t.id).map((b) => this.bookingView(u, b)) : [],
      newApplicants: mine ? apps.filter((a) => a.status === 'pending').length : 0,
      hasPendingChange: !!t.pending,
    };
    if (!full) {
      for (const k of ['address', 'meeting', 'contact', 'phone', 'recipient', 'lat', 'lng']) delete view[k];
    }
    if (t.pending) {
      view.pending = full ? t.pending : null;
    }
    return view;
  }
  tasks(u, filter = {}) {
    this.actor(u);
    let items = this.s.all('task').filter((t) => t.owner === u.id || t.status !== 'draft');
    if (filter.scope === 'mine')
      items = items.filter((t) =>
        u.role === 'requester' ? t.owner === u.id : this.apps(t.id).some((a) => a.userId === u.id),
      );
    else items = items.filter((t) => t.status === 'published' && t.start > now());
    if (filter.kind) items = items.filter((t) => t.kind === filter.kind);
    if (filter.org) items = items.filter((t) => t.owner === filter.org);
    if (filter.region) items = items.filter((t) => t.region.includes(filter.region));
    if (filter.available === '1')
      items = items.filter((t) => t.status === 'published' && t.start > now() && t.deadline > now() && !t.pending && this.apps(t.id).filter(activeApplication).length < t.capacity);
    if (filter.q)
      items = items.filter((t) =>
        [t.title, t.region, this.s.user(t.owner)?.name]
          .join(' ')
          .toLowerCase()
          .includes(filter.q.toLowerCase()),
      );
    if (filter.category) items = items.filter((t) => t.category === filter.category);
    if (filter.date)
      items = items.filter(
        (t) => new Date(t.start).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' }) === filter.date,
      );
    if (filter.minutes) items = items.filter((t) => t.minutes <= Number(filter.minutes));
    // Unknown routes remain ineligible; the same business rule works with a real provider later.
    if (filter.budget || filter.distance || filter.arrival)
      items = items.filter((t) =>
        routeFits(t, this.adapters.route({ task: t, origin: filter.origin }), filter),
      );
    const views = items.map((t) => {
      const route = this.adapters.route({ task: t, origin: filter.origin });
      const metric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
      return { ...this.taskView(u, t), route: {
        distance: metric(route.distance), minutes: metric(route.minutes),
        mode: ['walking', 'driving', 'transit', 'bus'].includes(route.mode) ? route.mode : null,
      } };
    });
    return views.sort((a, b) => {
      if (filter.sort === 'distance') {
        const delta = (a.route.distance ?? Infinity) - (b.route.distance ?? Infinity);
        if (delta) return delta;
      }
      return a.start.localeCompare(b.start);
    });
  }
  task(u, id) {
    this.actor(u);
    const t = this.s.get('task', id);
    check(t && (t.status !== 'draft' || t.owner === u.id), '需求不存在', 404);
    return this.taskView(u, t);
  }
  records(u) {
    return this.s.all('record').filter((r) => r.owner === u.id || r.userId === u.id);
  }
  bankReleases(u) {
    const bookings = this.s.all('booking').filter((b) => u.role === 'requester' ? b.owner === u.id : b.userId === u.id);
    const audits = this.s.all('audit');
    return bookings.flatMap((b) => {
      const events = audits.filter((a) => a.ref === b.id && a.before && a.after).flatMap((a) => {
        // Settlement consumes the charged portion; only the unused portion is released.
        const minutes = (a.before.held || 0) - (a.after.held || 0) - Math.max(0, (a.after.charged || 0) - (a.before.charged || 0));
        return minutes > 0 ? [{ minutes, created: a.created, note: a.reason || a.after.reason || (a.action === 'complete' ? '按实际服务结算，剩余占用已释放' : '预约调整，剩余占用已释放') }] : [];
      });
      // Task cancellation also releases bookings, even when there is no booking audit entry.
      if (b.status === 'cancelled' && b.released && !audits.some((a) => a.ref === b.id && a.after?.status === 'cancelled' && a.before?.held > 0)) events.push({ minutes: b.released, created: b.releasedAt, note: b.reason });
      return events.map((e) => ({ ...e, org_id: b.owner, orgName: this.s.user(b.owner)?.name, kind: 'release', state: '已释放', target: `booking/${b.id}` }));
    });
  }
  bank(u) {
    this.actor(u);
    const orgs =
      u.role === 'requester'
        ? [u.id]
        : [
            ...new Set([
              ...this.s
                .users()
                .filter((x) => x.role === 'requester')
                .map((x) => x.id),
              ...this.s
                .all('booking')
                .filter((b) => b.userId === u.id)
                .map((b) => b.owner),
            ]),
          ];
    const ledger = this.s.db
      .prepare(
        `SELECT * FROM ledger WHERE ${u.role === 'requester' ? 'org_id' : 'user_id'}=? ORDER BY created DESC`,
      )
      .all(u.id)
      .map((r) => ({ ...r, userName: this.s.user(r.user_id)?.name, orgName: this.s.user(r.org_id)?.name }));
    return {
      accounts: u.role === 'volunteer' ? orgs.map((o) => this.account(u.id, o)) : [],
      ledger,
      releases: this.bankReleases(u),
      bookings: this.s
        .all('booking')
        .filter((b) => (u.role === 'requester' ? b.owner === u.id : b.userId === u.id))
        .map((b) => this.bookingView(u, b)),
      issued: u.role === 'requester' ? this.records(u).reduce((n, r) => n + (r.confirmed || 0), 0) : 0,
      pending: this.records(u)
        .filter((r) => ['submitted', 'disputed'].includes(r.status))
        .reduce((n, r) => n + Math.max(0, r.submitted - r.confirmed), 0),
    };
  }
  map(u, scope = 'all') {
    this.actor(u);
    const records = this.s
      .all('record')
      .filter((r) => r.status === 'confirmed' && r.confirmed > 0 && r.recipients > 0);
    const events = new Map();
    for (const r of records) {
      if (scope === 'mine' && (u.role === 'requester' ? r.owner !== u.id : r.userId !== u.id)) continue;
      const t = this.s.get('task', r.taskId);
      if (!t.cell) continue;
      const e = events.get(t.id) || {
        id: t.id,
        cell: t.cell,
        region: t.region,
        category: t.category,
        users: [],
        minutes: 0,
        updated: r.updated,
      };
      e.users.push(r.userId);
      e.minutes += r.confirmed;
      events.set(t.id, e);
    }
    if (scope === 'all' || u.role === 'requester')
      for (const b of this.s
        .all('booking')
        .filter(
          (b) => b.status === 'completed' && b.charged > 0 && b.cell && (scope === 'all' || b.owner === u.id),
        ))
        events.set('booking:' + b.id, {
          id: 'booking:' + b.id,
          cell: b.cell,
          region: b.region,
          category: '兑换帮扶',
          users: [],
          minutes: 0,
          updated: b.updated,
        });
    const cells = new Map();
    for (const e of events.values()) {
      const c = cells.get(e.cell) || {
        cell: e.cell,
        region: e.region,
        count: 0,
        volunteers: [],
        categories: [],
        latest: e.updated,
      };
      c.count++;
      c.volunteers.push(...e.users);
      c.categories.push(e.category);
      if (c.latest < e.updated) c.latest = e.updated;
      cells.set(e.cell, c);
    }
    const own = records.filter((r) => (u.role === 'requester' ? r.owner === u.id : r.userId === u.id));
    const ownBookings =
      u.role === 'requester'
        ? this.s.all('booking').filter((b) => b.owner === u.id && b.status === 'completed' && b.charged > 0)
        : [];
    const ownCells = new Set(
      [...own.map((r) => this.s.get('task', r.taskId).cell), ...ownBookings.map((b) => b.cell)].filter(
        Boolean,
      ),
    );
    return {
      cells: [...cells.values()].map((c) => ({
        ...c,
        volunteers: new Set(c.volunteers).size,
        categories: [...new Set(c.categories)],
        brightness: Math.min(4, 1 + Math.floor(Math.log2(c.count))),
      })),
      summary: {
        places: ownCells.size,
        services: new Set(own.map((r) => r.taskId)).size + ownBookings.length,
        minutes: own.reduce((n, r) => n + r.confirmed, 0),
        pendingLocation:
          own.filter((r) => !this.s.get('task', r.taskId).cell).length +
          ownBookings.filter((b) => !b.cell).length,
      },
      provider: this.adapters.status?.map || 'manual',
      message: '已填写坐标的真实记录按固定网格统计，未填写坐标的记录等待补充；公开地图仅显示概略位置。',
    };
  }
  comment(u, ref, b) {
    this.actor(u);
    const task = this.s.get('task', ref),
      booking = this.s.get('booking', ref);
    const allowed =
      (task &&
        (task.owner === u.id ||
          this.apps(ref).some((a) => a.userId === u.id && (activeApplication(a) || a.wasAccepted)))) ||
      (booking && [booking.owner, booking.userId].includes(u.id));
    check(allowed, '仅相关参与者可留言', 403);
    const entry = this.s.put('comment', {
      owner: u.id,
      ref,
      content: text(b.content, '留言／评价', 2000),
      type: b.type === 'review' ? 'review' : 'message',
      name: u.name,
    });
    const target = booking ? (u.id === booking.owner ? booking.userId : booking.owner) : task.owner;
    if (target !== u.id) this.notify(target, '收到任务留言', booking ? `booking/${ref}` : `task/${ref}`);
    return entry;
  }
  comments(u, ref) {
    const task = this.s.get('task', ref),
      bk = this.s.get('booking', ref);
    check(
      (task &&
        (task.owner === u.id ||
          this.apps(ref).some((a) => a.userId === u.id && (activeApplication(a) || a.wasAccepted)))) ||
        (bk && [bk.owner, bk.userId].includes(u.id)),
      '无权查看留言',
      403,
    );
    return this.s.all('comment').filter((c) => c.ref === ref);
  }
  notices(u) {
    for (const a of this.s
      .all('application')
      .filter((a) => u.settings?.notifications !== false && a.userId === u.id && a.status === 'accepted')) {
      const t = this.s.get('task', a.taskId),
        key = `remind:${a.id}:${t.start}`;
      if (t.start > now() && Date.parse(t.start) < Date.now() + 86400000 && !this.s.get('notice', key))
        this.s.put('notice', {
          id: key,
          owner: u.id,
          title: '服务将在24小时内开始，请查看安排',
          target: `task/${t.id}`,
          read: false,
        });
    }
    if (u.settings?.notifications !== false)
      for (const b of this.s
        .all('booking')
        .filter((b) => [b.userId, b.owner].includes(u.id) && b.status === 'accepted')) {
        const key = `booking-remind:${b.id}:${u.id}:${b.start}`;
        if (b.start > now() && Date.parse(b.start) < Date.now() + 86400000 && !this.s.get('notice', key))
          this.s.put('notice', {
            id: key,
            owner: u.id,
            title: '兑换服务将在24小时内开始，请核对安排',
            target: `booking/${b.id}`,
            read: false,
          });
      }
    return this.s
      .all('notice')
      .filter((n) => n.owner === u.id)
      .sort((a, b) => b.created.localeCompare(a.created));
  }
}
