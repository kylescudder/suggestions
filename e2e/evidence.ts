import type { Page, TestInfo } from '@playwright/test'

// Saves a named PNG of the current, already-asserted state and attaches it to
// the test. The JSON report then maps the image to this test and project.
export async function checkpoint(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path })
  await testInfo.attach(name, { path, contentType: 'image/png' })
}
