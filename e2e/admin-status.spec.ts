import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { checkpoint } from './evidence'

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
  await expect(page.getByLabel(`Status for ${title}`)).toHaveValue('reviewed')
  await checkpoint(page, info, 'reviewed-filter-after-reload')
})
