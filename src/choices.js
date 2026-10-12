// Use a lightweight data model without creating native CEF select widgets.
customElements.define('qw-choice', class extends HTMLElement {
  get options() { return [...this.querySelectorAll('option')]; }
  get selectedOptions() { const selected = this.options.find(o => o.hasAttribute('selected')) || this.options[0]; return selected ? [selected] : []; }
  get value() { return this.selectedOptions[0]?.value || ''; }
  set value(value) { for (const option of this.options) option.toggleAttribute('selected', option.value === String(value)); }
  get disabled() { return this.hasAttribute('disabled'); }
});
let openMenu;
function closeMenu() {
  if (!openMenu) return;
  openMenu.trigger.setAttribute('aria-expanded', 'false');
  openMenu.element.remove(); openMenu = null;
}
document.addEventListener('pointerdown', e => {
  if (openMenu && !openMenu.element.contains(e.target) && e.target !== openMenu.trigger) closeMenu();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && openMenu) { const trigger = openMenu.trigger; closeMenu(); trigger.focus(); }
});
export function installChoices(root = document) {
  closeMenu();
  for (const select of root.querySelectorAll('qw-choice')) {
    let trigger = select.nextElementSibling;
    if (!trigger?.matches('.choice-trigger')) {
      trigger = document.createElement('button');
      trigger.type = 'button'; trigger.className = 'choice-trigger';
      trigger.dataset.choiceFor = select.id;
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      const label = select.getAttribute('aria-label') || document.querySelector(`label[for="${select.id}"]`)?.textContent || '选择';
      trigger.setAttribute('aria-label', label);
      select.insertAdjacentElement('afterend', trigger);
      trigger.addEventListener('click', () => {
        if (openMenu?.trigger === trigger) { closeMenu(); return; }
        closeMenu();
        const menu = document.createElement('div');
        menu.className = 'choice-menu'; menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', label);
        for (const option of select.options) {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = option.textContent;
          button.setAttribute('role', 'option'); button.setAttribute('aria-selected', String(option.value === select.value));
          button.disabled = option.disabled;
          button.addEventListener('click', () => {
            select.value = option.value; trigger.textContent = option.textContent + ' ▾';
            closeMenu(); trigger.focus(); select.dispatchEvent(new Event('change', { bubbles: true }));
          });
          menu.append(button);
        }
        document.body.append(menu);
        const rect = trigger.getBoundingClientRect();
        menu.style.width = `${Math.min(innerWidth - 16, Math.max(rect.width, 180))}px`;
        menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - menu.offsetWidth - 8))}px`;
        menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - menu.offsetHeight - 8))}px`;
        openMenu = { element: menu, trigger }; trigger.setAttribute('aria-expanded', 'true');
        (menu.querySelector('[aria-selected="true"]') || menu.firstElementChild)?.focus();
        menu.addEventListener('keydown', e => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
          e.preventDefault(); const buttons = [...menu.querySelectorAll('button:not(:disabled)')];
          const index = buttons.indexOf(document.activeElement);
          buttons[e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
        });
      });
    }
    trigger.textContent = (select.selectedOptions[0]?.textContent || '选择') + ' ▾';
    trigger.disabled = select.disabled;
  }
}
