import { expect, test } from '@playwright/test'
test('a signed-in profile remains available after reload', async ({ page }) => {
  await page.goto('/profile')
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true })
  ).toBeVisible()
  await page.reload()
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true })
  ).toBeVisible()
})
test('a signed-out visitor must sign in to open their profile', async ({
  browser
}) => {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] }
  })
  try {
    const page = await context.newPage()
    await page.goto(process.env.E2E_BASE_URL + '/profile')
    await expect(page).toHaveURL(/\/auth\/sign-in/)
    await expect(page.locator('#password')).toBeVisible()
  } finally {
    await context.close()
  }
})

test('an idea is saved and appears in the admin dashboard after reload', async ({
  page
}, info) => {
  await page.goto('/')
  const submit = page.getByRole('button', { name: '✨ Share Your Magic ✨' })
  await expect(submit).toBeDisabled()
  const title = `A quiet workspace ${info.project.name}`
  await page.getByLabel('Your Magical Idea').fill(title)
  await page
    .getByLabel('Tell us more about your magic')
    .fill('A permanent test of saving and reviewing ideas.')
  await submit.click()
  await expect(
    page.getByText('✨ Your magical idea has been captured!')
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Admin Dashboard', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: title, exact: true })
  ).toBeVisible()
  await page.reload()
  await page
    .getByRole('button', { name: 'Admin Dashboard', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: title, exact: true })
  ).toBeVisible()
  await page.screenshot({ path: info.outputPath('ideas.png'), fullPage: true })
})
