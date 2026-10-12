export async function choose(page, id, value) {
  const label = await page.locator(`#${id}`).evaluate((node, value) => node.options.find(o => o.value === value)?.textContent, String(value));
  await page.locator(`[data-choice-for="${id}"]`).click();
  await page.getByRole('option', { name: label, exact: true }).click();
}
