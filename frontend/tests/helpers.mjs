/** Opens a Radix Select trigger and picks the option whose data-value matches. */
export async function chooseValue(page, trigger, value) {
  await trigger.click();
  await page.locator(`[role="option"][data-value="${value}"]`).click();
}
