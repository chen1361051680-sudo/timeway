// A local bottom sheet: dragging never rebuilds or pans the underlying map.
class MapSheet {
  mount(state) {
    this.root = document.querySelector('.love-map');
    if (!this.root) return;
    this.state = state;
    this.sheet = this.root.querySelector('.map-sheet');
    this.scroll = this.root.querySelector('.map-sheet-scroll');
    this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    const grab = this.root.querySelector('.map-sheet-grab');
    const intro = this.root.querySelector('.map-summary-intro');
    for (const target of [grab, intro]) {
      target.addEventListener(
        'pointerdown',
        (event) => {
          if (event.button !== 0 || this.drag) return;
          this.begin(event.clientY);
          this.pointer = event.pointerId;
          target.setPointerCapture(event.pointerId);
        },
        options,
      );
      target.addEventListener(
        'pointermove',
        (event) => {
          if (!this.drag || this.pointer !== event.pointerId) return;
          this.move(event.clientY);
        },
        options,
      );
      target.addEventListener(
        'pointerup',
        (event) => {
          if (this.pointer === event.pointerId) this.end();
        },
        options,
      );
      target.addEventListener('pointercancel', () => this.end(true), options);
      target.addEventListener('lostpointercapture', () => this.end(true), options);
    }
    // At the top of the list, a downward touch transfers from scrolling to dragging.
    this.scroll.addEventListener(
      'touchstart',
      (event) => {
        this.touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
      },
      { ...options, passive: true },
    );
    this.scroll.addEventListener(
      'touchmove',
      (event) => {
        if (this.touchY === null || event.touches.length !== 1 || !event.cancelable) return;
        const y = event.touches[0].clientY;
        if (!this.drag && this.scroll.scrollTop <= 0 && y - this.touchY > 8) this.begin(this.touchY);
        if (this.drag && this.pointer === undefined) {
          event.preventDefault();
          this.move(y);
        } else if (this.scroll.scrollTop > 0) this.touchY = y;
      },
      { ...options, passive: false },
    );
    this.scroll.addEventListener(
      'touchend',
      () => {
        if (this.pointer === undefined) this.end();
        this.touchY = null;
      },
      options,
    );
    this.scroll.addEventListener(
      'touchcancel',
      () => {
        if (this.pointer === undefined) this.end(true);
        this.touchY = null;
      },
      options,
    );
    this.sheet.addEventListener(
      'pointerdown',
      () => {
        this.suppressClickUntil = 0;
      },
      { ...options, capture: true },
    );
    this.sheet.addEventListener(
      'click',
      (event) => {
        if (performance.now() < (this.suppressClickUntil || 0)) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      { ...options, capture: true },
    );
    grab.addEventListener(
      'keydown',
      (event) => {
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          this.setCollapsed(['ArrowDown', 'End'].includes(event.key));
        }
      },
      options,
    );
    this.resize = new ResizeObserver(() => this.measure());
    this.resize.observe(this.root);
    this.resize.observe(this.root.querySelector('.map-summary-banner'));
    this.measure();
  }
  measure() {
    if (!this.root?.isConnected) return;
    const height = this.root.clientHeight;
    this.peek = Math.ceil(
      this.root.querySelector('.map-summary-banner').getBoundingClientRect().height +
        this.root.querySelector('.map-sheet-grab').offsetHeight +
        2,
    );
    this.height = Math.min(height - 100, Math.max(this.peek + 150, height * 0.48));
    this.max = Math.max(0, this.height - this.peek);
    this.root.style.setProperty('--sheet-height', `${this.height}px`);
    if (this.drag) this.end(true);
    this.setCollapsed(this.state.collapsed, false);
  }
  position(offset) {
    this.offset = Math.max(0, Math.min(this.max, offset));
    this.root.style.setProperty('--sheet-offset', `${this.offset}px`);
    this.root.style.setProperty('--sheet-visible', `${this.height - this.offset}px`);
  }
  setCollapsed(collapsed, animate = true) {
    if (!this.root?.isConnected) return;
    this.state.collapsed = collapsed;
    this.sheet.classList.toggle('is-settling', animate);
    this.root.classList.toggle('is-collapsed', collapsed);
    this.sheet.dataset.snap = collapsed ? 'collapsed' : 'expanded';
    this.scroll.hidden = collapsed;
    this.root.querySelector('#map-action').hidden = collapsed;
    if (collapsed) this.scroll.scrollTop = 0;
    const grab = this.root.querySelector('.map-sheet-grab');
    grab.setAttribute('aria-label', collapsed ? '展开需求面板' : '收起需求面板');
    grab.setAttribute('aria-expanded', String(!collapsed));
    this.position(collapsed ? this.max : 0);
  }
  begin(y) {
    this.drag = {
      y,
      offset: this.offset,
      started: performance.now(),
      moved: false,
      collapsed: this.state.collapsed,
    };
    this.sheet.classList.remove('is-settling');
    this.sheet.classList.add('is-dragging');
  }
  move(y) {
    const distance = y - this.drag.y;
    if (Math.abs(distance) > 5) this.drag.moved = true;
    if (this.drag.moved) {
      this.scroll.hidden = false;
      this.root.querySelector('#map-action').hidden = false;
      this.position(this.drag.offset + distance);
    }
    this.drag.lastY = y;
  }
  end(cancelled = false) {
    if (!this.drag) return;
    const drag = this.drag;
    this.drag = null;
    this.pointer = undefined;
    this.sheet.classList.remove('is-dragging');
    if (!drag.moved) {
      this.setCollapsed(drag.collapsed, false);
      return;
    }
    this.suppressClickUntil = performance.now() + 350;
    const distance = (drag.lastY ?? drag.y) - drag.y;
    const velocity = distance / Math.max(1, performance.now() - drag.started);
    const collapsed = cancelled
      ? drag.collapsed
      : Math.abs(velocity) > 0.4 && Math.abs(distance) > 24
        ? distance > 0
        : this.offset > this.max / 2;
    this.setCollapsed(collapsed);
  }
  unmount() {
    this.abort?.abort();
    this.resize?.disconnect();
    this.drag = null;
    this.pointer = undefined;
    this.touchY = null;
    this.suppressClickUntil = 0;
    this.root = null;
  }
}
export const mapSheet = new MapSheet();
