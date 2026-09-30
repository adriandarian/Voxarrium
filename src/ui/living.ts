import type { Interaction, InteractionTarget } from '../simulation/interaction';

export function createLivingUi() {
  const prompt = document.getElementById('interact-prompt')!;
  const dialogue = document.getElementById('dialogue')!;
  const name = document.getElementById('dialogue-name')!;
  const text = document.getElementById('dialogue-text')!;
  return {
    update(target: InteractionTarget | null, active: Interaction | null, visible: boolean) {
      prompt.hidden = !visible || !target || !!active;
      const label = target ? `F · ${target.kind === 'npc' ? 'Talk to' : 'Read about'} ${target.name}` : '';
      if (prompt.textContent !== label) prompt.textContent = label;
      dialogue.hidden = !visible || !active;
      if (active) { name.textContent = active.name; text.textContent = active.text; }
    },
  };
}
