import { createModel, newId } from './factory';
import { normalizeModel } from './normalize';
import { addBorderArrow, addJunction, addLink, addReferent, connectBoxes, decompose } from './ops';
import type { Box, Idef0Diagram, Idef3Diagram, Model } from './types';

/** Навчальний приклад моделі: меблева майстерня. */
export function buildSampleModel(): Model {
  const m = createModel('Меблева майстерня');
  m.author = 'Студент групи ІС-21';
  m.purpose = 'Описати процес виготовлення меблів на замовлення та оцінити його вартість.';
  m.viewpoint = 'Директор майстерні';
  m.definition = 'Модель процесу виконання замовлення на виготовлення корпусних меблів.';
  m.costCenters = [
    { id: newId('cc'), name: 'Оплата праці', definition: 'Заробітна плата персоналу' },
    { id: newId('cc'), name: 'Матеріали', definition: 'ДСП, фурнітура, лаки та фарби' },
  ];
  const [labor, mat] = m.costCenters.map((c) => c.id);
  const root = m.diagrams[m.rootDiagramId] as Idef0Diagram;
  const a0 = root.boxes[0];
  a0.name = 'Виготовити меблі на замовлення';
  a0.definition = 'Повний цикл виконання замовлення клієнта: від прийому до встановлення.';

  addBorderArrow(m, root.id, a0.id, 'input', 'Замовлення клієнта');
  addBorderArrow(m, root.id, a0.id, 'input', 'Матеріали');
  addBorderArrow(m, root.id, a0.id, 'control', 'Технічні вимоги');
  addBorderArrow(m, root.id, a0.id, 'control', 'Стандарти якості');
  addBorderArrow(m, root.id, a0.id, 'output', 'Рахунок клієнту');
  addBorderArrow(m, root.id, a0.id, 'output', 'Готові меблі');
  addBorderArrow(m, root.id, a0.id, 'mechanism', 'Персонал');
  addBorderArrow(m, root.id, a0.id, 'mechanism', 'Обладнання');
  root.arrows[0].definition = 'Заявка клієнта з побажаннями щодо виробу.';
  root.arrows[5].definition = 'Виготовлені та встановлені меблі.';

  const childId = decompose(m, a0.id, 'idef0', 3).id!;
  const child = m.diagrams[childId] as Idef0Diagram;
  const [b1, b2, b3] = child.boxes;
  b1.name = 'Прийняти та оформити замовлення';
  b2.name = 'Виготовити меблі';
  b3.name = 'Доставити та встановити меблі';
  b1.definition = 'Консультація клієнта, замір приміщення, оформлення договору.';
  b2.definition = 'Виробництво меблів у цеху.';
  b3.definition = 'Транспортування та монтаж меблів у клієнта.';
  setAbc(b1, { [labor]: 200, [mat]: 0 }, 1.5);
  setAbc(b3, { [labor]: 300, [mat]: 50 }, 3);
  normalizeModel(m);

  // під'єднуємо граничні стрілки
  const byLabel = (label: string) => {
    const pa = root.arrows.find((a) => a.label === label)!;
    return child.arrows.find((a) => [a.source, a.target].some((e) => e.kind === 'border' && e.parentArrowId === pa.id))!;
  };
  byLabel('Замовлення клієнта').target = { kind: 'box', boxId: b1.id, role: 'input' };
  byLabel('Матеріали').target = { kind: 'box', boxId: b2.id, role: 'input' };
  byLabel('Технічні вимоги').target = { kind: 'box', boxId: b1.id, role: 'control' };
  byLabel('Стандарти якості').target = { kind: 'box', boxId: b2.id, role: 'control' };
  byLabel('Рахунок клієнту').source = { kind: 'box', boxId: b1.id, role: 'output' };
  byLabel('Готові меблі').source = { kind: 'box', boxId: b3.id, role: 'output' };
  const staff = byLabel('Персонал');
  staff.target = { kind: 'box', boxId: b1.id, role: 'mechanism' };
  byLabel('Обладнання').target = { kind: 'box', boxId: b2.id, role: 'mechanism' };
  connectBoxes(m, child.id, b1.id, b2.id, 'input', 'Специфікація замовлення');
  connectBoxes(m, child.id, b2.id, b3.id, 'input', 'Виготовлені вироби');
  // розгалуження стрілки «Персонал»
  const forkY = 700;
  const forkX = b1.x + b1.w / 2;
  child.arrows.push({ id: newId('a'), label: '', definition: '', source: { kind: 'arrow', arrowId: staff.id, x: forkX, y: forkY }, target: { kind: 'box', boxId: b2.id, role: 'mechanism' } });
  child.arrows.push({ id: newId('a'), label: '', definition: '', source: { kind: 'arrow', arrowId: staff.id, x: forkX, y: forkY }, target: { kind: 'box', boxId: b3.id, role: 'mechanism' } });

  // IDEF3 для «Виготовити меблі»
  const i3Id = decompose(m, b2.id, 'idef3', 5).id!;
  const i3 = m.diagrams[i3Id] as Idef3Diagram;
  const [u1, u2, u3, u4, u5] = i3.boxes;
  const names = ['Розкроїти матеріал', 'Зібрати каркас', 'Пофарбувати', 'Покрити лаком', 'Упакувати вироби'];
  i3.boxes.forEach((u, i) => (u.name = names[i]));
  u3.definition = 'Фарбування виконується приблизно для 30% замовлень.';
  u4.definition = 'Лакування виконується для решти (70%) замовлень.';
  const pos: [number, number][] = [
    [50, 354],
    [240, 354],
    [530, 240],
    [530, 470],
    [840, 354],
  ];
  i3.boxes.forEach((u, i) => {
    u.x = pos[i][0];
    u.y = pos[i][1];
  });
  setAbc(u1, { [labor]: 150, [mat]: 2000 }, 2);
  setAbc(u2, { [labor]: 400, [mat]: 300 }, 4);
  setAbc(u3, { [labor]: 250, [mat]: 400 }, 3, 0.3);
  setAbc(u4, { [labor]: 200, [mat]: 250 }, 2, 0.7);
  setAbc(u5, { [labor]: 50, [mat]: 100 }, 1);
  const j1 = addJunction(m, i3.id, 'xor', false, 450, 390).id!;
  const j2 = addJunction(m, i3.id, 'xor', false, 760, 390).id!;
  addLink(m, i3.id, u1.id, u2.id);
  addLink(m, i3.id, u2.id, j1);
  addLink(m, i3.id, j1, u3.id, 'Потрібне фарбування');
  addLink(m, i3.id, j1, u4.id, 'Потрібне лакування');
  addLink(m, i3.id, u3.id, j2);
  addLink(m, i3.id, u4.id, j2);
  addLink(m, i3.id, j2, u5.id);
  const ref = addReferent(m, i3.id, 120, 200).id!;
  i3.referents[0].name = 'Креслення виробу';
  addLink(m, i3.id, ref, u1.id);
  normalizeModel(m);
  return m;
}

function setAbc(b: Box, costs: Record<string, number>, duration: number, frequency = 1) {
  b.abc = { costs, duration, frequency };
}
