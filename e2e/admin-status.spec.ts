import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { checkpoint } from './evidence'

// The filtered list keeps the previous list on screen while it reloads, so a
// filter is only confirmed once every idea shown carries the chosen status.
async function expectOnlyStatus(page: Page, status: string) {
  await expect
    .poll(() =>
      page
        .locator('select[aria-label^="Status for"]')
        .evaluateAll(
          (selects, wanted) =>
            selects.length > 0 &&
            selects.every((s) => (s as HTMLSelectElement).value === wanted),
          status
        )
    )
    .toBe(true)
}

test('an admin changes an idea status and the filtered list follows', async ({
  page
}, info) => {
  await page.goto('/')
  const title = `A status workflow ${info.project.name} ${randomUUID()}`
  await page.getByLabel('Your Magical Idea').fill(title)
  await page
    .getByLabel('Tell us more about your magic')
    .fill('A permanent test of changing an idea status in the dashboard.')
  await page.getByRole('button', { name: '✨ Share Your Magic ✨' }).click()
  await expect(
    page.getByText('✨ Your magical idea has been captured!')
  ).toBeVisible()

  await page
    .getByRole('button', { name: 'Admin Dashboard', exact: true })
    .click()
  const status = page.getByLabel(`Status for ${title}`)
  await expect(status).toHaveValue('pending')
  await checkpoint(page, info, 'dashboard-idea-pending')
  await status.selectOption('reviewed')
  await expect(page.getByText('Status updated successfully!')).toBeVisible()
  await expect(status).toHaveValue('reviewed')
  await checkpoint(page, info, 'status-changed-to-reviewed')

  // Filtering to pending must drop the reviewed idea from the list.
  await page.locator('.cursor-pointer', { hasText: 'Pending' }).first().click()
  await expect(page.getByText(/Showing pending suggestions/)).toBeVisible()
  await expectOnlyStatus(page, 'pending')
  await expect(
    page.getByRole('heading', { name: title, exact: true })
  ).toHaveCount(0)
  await checkpoint(page, info, 'pending-filter-hides-reviewed-idea')

  // After a reload the stored status and the reviewed filter still agree.
  await page.reload()
  await page
    .getByRole('button', { name: 'Admin Dashboard', exact: true })
    .click()
  await page.locator('.cursor-pointer', { hasText: 'Reviewed' }).first().click()
  await expect(page.getByText(/Showing reviewed suggestions/)).toBeVisible()
  await expectOnlyStatus(page, 'reviewed')
  await expect(page.getByLabel(`Status for ${title}`)).toHaveValue('reviewed')
  await checkpoint(page, info, 'reviewed-filter-after-reload')
})
