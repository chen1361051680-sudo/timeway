const images = {
  陪伴交流: 'companion',
  陪诊协助: 'medical',
  生活协助: 'housework',
  出行陪同: 'walk',
};

export function serviceImage(task) {
  return `/images/hall-${images[task.category] || 'companion'}.webp`;
}
