import { randomInt } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { db, one, pool, sql } from '../src/lib/db'
import { keyed } from '../src/lib/core'
import { totp } from '../src/lib/identity'
import { admin, lookupCatalog } from './fixtures'
const image = 'scripts/fixtures/tutor-1.jpg'

async function login(page: Page, role: 'tutor' | 'parent', next?: string) {
  if (next) await expect(page).toHaveURL(/\/login\?/)
  else await page.goto('/login?role=' + role)
  const phone = '+916' + randomInt(100000000, 999999999)
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByRole('button', { name: 'Send verification code' }).click()
  await expect(page.getByLabel('Verification code')).toBeVisible()
  const otp = await one<{ id: string }>(
    sql`select id from otp_challenges where phone_hash=${keyed('phone:' + phone)} order by expires_at desc limit 1`,
  )
  const code = String(randomInt(100000, 999999))
  // The provider fixture runs only in the isolated test database.
  await db.execute(
    sql`update otp_challenges set otp_hash=${keyed(`otp:${otp!.id}:${code}`)} where id=${otp!.id}`,
  )
  await page.getByLabel('Verification code').fill(code)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  if (next) await expect(page).toHaveURL(next)
  else await expect(page).toHaveURL(new RegExp('/' + role + '/dashboard'))
  const user = await one<{ id: string }>(
    sql`select id from users where phone_hash=${keyed('phone:' + phone)}`,
  )
  return { phone, id: user!.id }
}
async function pendingRequest(page: Page, endpoint: string, values: unknown) {
  return page.request.post('/api/v1' + endpoint, {
    data: values,
    headers: { Origin: 'http://localhost:3107' },
  })
}
test.afterAll(async () => {
  await pool.end()
})

test('public search works on mobile and protects private endpoints', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const browserErrors: string[] = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Find a great tutor. Close to home.' }),
  ).toBeVisible()
  await page
    .getByRole('form', { name: 'Find a tutor' })
    .getByLabel('Class')
    .selectOption('8')
  await page.getByRole('button', { name: 'Search tutors' }).click()
  await expect(page).toHaveURL(/\/tutors\?class=8/)
  await expect(
    page.getByRole('heading', { name: 'Find a tutor', exact: true }),
  ).toBeVisible()
  expect(await page.locator('body').evaluate((body) => body.scrollWidth)).toBe(
    390,
  )
  expect(browserErrors).toEqual([])
  const missingOrigin = await page.request.post('/api/v1/auth/logout', {
    data: {},
  })
  expect(missingOrigin.status()).toBe(403)
  const unauthenticated = await page.request.get(
    '/api/v1/admin/documents/00000000-0000-4000-8000-000000000000',
  )
  expect(unauthenticated.status()).toBe(401)
})
test('tutor applies, admin approves, tutor activates, guardian consents to direct and open matches', async ({
  browser,
}) => {
  const tutorContext = await browser.newContext(),
    adminContext = await browser.newContext(),
    guardianContext = await browser.newContext()
  const tutorPage = await tutorContext.newPage(),
    adminPage = await adminContext.newPage(),
    parentPage = await guardianContext.newPage()
  const { locality, board, subject } = await lookupCatalog()

  const applicant = await login(tutorPage, 'tutor')
  await tutorPage
    .getByRole('link', { name: 'Verification application', exact: true })
    .click()
  await tutorPage.getByLabel('Full legal name').fill('Synthetic Tutor One')
  const name = 'Synthetic Tutor ' + randomInt(100000, 999999)
  await tutorPage.getByLabel('Public display name').fill(name)
  await tutorPage.getByLabel('Home locality').selectOption(locality)
  await tutorPage
    .getByLabel('Short introduction')
    .fill('I teach mathematics through worked examples and practice.')
  await tutorPage
    .getByLabel('Profile photo', { exact: true })
    .setInputFiles(image)
  await expect(tutorPage.getByText('Uploaded', { exact: true })).toBeVisible()
  await expect(
    tutorPage.getByText('Draft saved', { exact: true }),
  ).toBeVisible()
  await tutorPage.reload()
  await expect(tutorPage.getByLabel('Public display name')).toHaveValue(name)
  await tutorPage.getByRole('button', { name: 'Continue' }).click()
  for (const label of [
    'Mathematics',
    'Class 8',
    'CBSE',
    'Sahadevkhunta',
    'Monday',
  ])
    await tutorPage.getByRole('checkbox', { name: label, exact: true }).check()
  await tutorPage.getByLabel('Expected fee (INR)').fill('3500')
  await tutorPage.getByRole('button', { name: 'Continue' }).click()
  await tutorPage.getByLabel('Highest qualification').fill('B.Ed.')
  await tutorPage.getByLabel('Institution').fill('Fictional College')
  await tutorPage.getByLabel('Teaching experience in years').fill('4')
  await tutorPage
    .getByLabel('Academic credentials')
    .fill('Synthetic qualification record')
  await tutorPage.getByRole('button', { name: 'Continue' }).click()
  await tutorPage
    .getByLabel('Government identity document', { exact: true })
    .setInputFiles(image)
  await tutorPage
    .getByLabel('Academic certificate', { exact: true })
    .setInputFiles(image)
  await expect(tutorPage.getByText('Uploaded', { exact: true })).toHaveCount(2)
  await tutorPage.getByRole('button', { name: 'Continue' }).click()
  await tutorPage.getByRole('checkbox', { name: /I confirm/ }).check()
  await tutorPage.getByRole('button', { name: 'Submit application' }).click()
  await expect(
    tutorPage.getByText('Revision 1 is with the verification team.'),
  ).toBeVisible()
  const application = await one<{ id: string; slug: string }>(
    sql`select a.id,t.slug from tutor_applications a join tutor_profiles t on t.id=a.tutor_id where a.tutor_id=${applicant.id}`,
  )
  const document = await one<{ id: string }>(
    sql`select id from verification_documents where application_id=${application!.id} and kind='identity'`,
  )
  const denied = await tutorPage.request.get(
    '/api/v1/admin/documents/' + document!.id,
  )
  expect(denied.status()).toBe(403)

  const reviewer = await admin()
  await adminPage.goto('/login?role=admin')
  await adminPage.getByLabel('Administrator email').fill(reviewer.email)
  await adminPage
    .getByLabel('Password', { exact: true })
    .fill(reviewer.password)
  await adminPage
    .getByLabel('Authenticator code')
    .fill(totp(reviewer.key, Math.floor(Date.now() / 30000)))
  await adminPage.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(
    adminPage.getByRole('heading', { name: 'Admin overview' }),
  ).toBeVisible()
  await adminPage
    .getByRole('link', { name: 'Application review', exact: true })
    .click()
  await adminPage
    .getByRole('row')
    .filter({ hasText: name })
    .getByRole('link', { name: 'Review', exact: true })
    .click()
  await expect(
    adminPage.getByRole('heading', { name, exact: true }),
  ).toBeVisible()
  const privateDoc = await adminPage.request.get(
    '/api/v1/admin/documents/' + document!.id,
  )
  expect(privateDoc.ok()).toBe(true)
  expect(privateDoc.headers()['content-type']).toBe('image/jpeg')
  await adminPage
    .getByRole('checkbox', { name: 'Reviewed government identity document' })
    .check()
  await adminPage
    .getByRole('checkbox', { name: 'Reviewed academic credentials' })
    .check()
  await adminPage
    .getByLabel('Decision', { exact: true })
    .selectOption('approved')
  await adminPage
    .getByLabel('Feedback to tutor')
    .fill('Synthetic review completed.')
  await adminPage
    .getByLabel('Internal reviewer notes (optional)')
    .fill('Synthetic internal note.')
  await adminPage.getByRole('button', { name: 'Record decision' }).click()
  await expect(
    adminPage.getByText('approved', { exact: true }).first(),
  ).toBeVisible()
  await adminPage
    .getByRole('link', { name: 'Onboarding fee', exact: true })
    .click()
  await adminPage.getByLabel('Amount in paise').fill('12400')
  await adminPage
    .getByRole('button', { name: 'Set active onboarding fee' })
    .click()
  await expect(adminPage.getByText('Current fee ₹124')).toBeVisible()
  const lockedProfile = await parentPage.request.get(
    '/api/v1/tutors/' + application!.slug,
  )
  expect(lockedProfile.status()).toBe(404)

  await tutorPage.goto('/tutor/activate')
  await tutorPage.getByRole('button', { name: 'Open secure checkout' }).click()
  await tutorPage
    .getByRole('button', { name: 'Simulate failed payment' })
    .click()
  await expect(
    tutorPage.getByText('Test payment failed.', { exact: false }),
  ).toBeVisible()
  await tutorPage
    .getByRole('button', { name: 'Simulate successful payment' })
    .click()
  await expect(tutorPage.getByText('Your profile is active.')).toBeVisible()

  await parentPage.goto('/tutors/' + application!.slug)
  await expect(
    parentPage.getByRole('heading', { name, exact: true }),
  ).toBeVisible()
  await parentPage
    .getByRole('link', { name: 'Request tutor', exact: true })
    .click()
  const parent = await login(
    parentPage,
    'parent',
    '/tutors/' + application!.slug + '?request=1',
  )
  await parentPage.goto('/parent/students')
  await parentPage.getByLabel('Student label').fill('Learner A')
  await parentPage.getByLabel('Class', { exact: true }).selectOption('8')
  await parentPage.getByLabel('Board', { exact: true }).selectOption(board)
  await parentPage.getByRole('button', { name: 'Add student' }).click()
  await expect(
    parentPage.getByRole('heading', { name: 'Learner A' }),
  ).toBeVisible()
  await parentPage.goto('/tutors/' + application!.slug + '?request=1')
  await parentPage
    .getByRole('link', { name: 'Create a direct requirement' })
    .click()
  const student = await one<{ id: string }>(
    sql`select id from student_profiles where parent_id=${parent.id}`,
  )
  await parentPage.getByLabel('Student profile').selectOption(student!.id)
  await parentPage
    .getByLabel('Locality', { exact: true })
    .selectOption(locality)
  await parentPage
    .getByRole('checkbox', { name: 'Mathematics', exact: true })
    .check()
  await parentPage.getByLabel('Budget (INR)').fill('3600')
  await parentPage
    .getByRole('checkbox', { name: 'Monday', exact: true })
    .check()
  await parentPage.getByLabel('Preferred schedule').selectOption('After 5 pm')
  await parentPage.getByRole('button', { name: 'Save draft' }).click()
  await expect(parentPage).toHaveURL(/\/parent\/requirements\/[a-f0-9-]+$/)
  await expect(
    parentPage.getByRole('checkbox', { name: 'Mathematics', exact: true }),
  ).toBeChecked()
  await parentPage
    .getByRole('button', { name: 'Publish and send request' })
    .click()
  await parentPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click()
  await expect(
    parentPage.getByText('pending tutor', { exact: true }),
  ).toBeVisible()
  const requirement = parentPage.url().split('/').at(-1)
  const match = await one<{ id: string }>(
    sql`select id from match_requests where requirement_id=${requirement} and tutor_id=${applicant.id}`,
  )
  expect(
    (
      await tutorPage.request.get('/api/v1/matches/' + match!.id + '/contact')
    ).status(),
  ).toBe(404)
  await tutorPage.goto('/tutor/requests')
  await tutorPage.getByRole('button', { name: 'Accept request' }).click()
  await expect(
    tutorPage.getByText('awaiting parent consent', { exact: true }),
  ).toBeVisible()
  await parentPage.reload()
  await expect(
    parentPage.getByRole('checkbox', { name: /I agree to share/ }),
  ).not.toBeChecked()
  expect(
    (
      await pendingRequest(parentPage, '/matches/' + match!.id + '/consent', {
        agreed: false,
      })
    ).status(),
  ).toBe(400)
  await parentPage.getByRole('checkbox', { name: /I agree to share/ }).check()
  await parentPage
    .getByRole('button', { name: 'Confirm and share number' })
    .click()
  await expect(parentPage.getByText('1 of 3 contacts shared')).toBeVisible()

  await tutorPage.goto('/tutor/connections')
  await tutorPage
    .getByRole('button', { name: 'Reveal guardian number' })
    .click()
  await expect(
    tutorPage.getByRole('link', { name: parent.phone }),
  ).toBeVisible()
  await parentPage.getByRole('button', { name: 'Revoke access' }).click()
  await parentPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click()
  await expect(
    parentPage.getByText('Access blocked or revoked', { exact: true }),
  ).toBeVisible()
  expect(
    (
      await tutorPage.request.get('/api/v1/matches/' + match!.id + '/contact')
    ).status(),
  ).toBe(404)
  const subjectMatches = await one(
    sql`select 1 from requirement_subjects where requirement_id=${requirement} and subject_id=${subject}`,
  )
  expect(subjectMatches).toBeDefined()

  const openBudget = randomInt(10000, 99999)
  const openPrice = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(openBudget)
  const openDraft = await pendingRequest(parentPage, '/requirements', {
    student: student!.id,
    class: 8,
    board,
    locality,
    subjects: [subject],
    budget: openBudget,
    unit: 'month',
    days: [1],
    schedule: 'After 7 pm',
    place: 'student_home',
    details: 'Private academic intake note',
    mode: 'open',
  })
  expect(openDraft.ok()).toBe(true)
  const openId = (await openDraft.json()).data.id
  await parentPage.goto('/parent/requirements/' + openId)
  await parentPage.getByRole('button', { name: 'Publish', exact: true }).click()
  await parentPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click()
  await expect(parentPage.getByText('published', { exact: true })).toBeVisible()

  await tutorPage.goto('/tutor/opportunities')
  const opportunity = tutorPage
    .locator('section.card')
    .filter({ hasText: openPrice + '/month' })
    .first()
  await expect(opportunity).toBeVisible()
  await expect(tutorPage.getByText('Private academic intake note')).toHaveCount(
    0,
  )
  await opportunity.getByRole('button', { name: 'Express interest' }).click()
  await tutorPage
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirm', exact: true })
    .click()
  await expect(opportunity).toHaveCount(0)
  await parentPage.reload()
  await parentPage.getByRole('button', { name: 'Choose tutor' }).click()
  await expect(
    parentPage.getByRole('checkbox', { name: /I agree to share/ }),
  ).not.toBeChecked()
  await parentPage.getByRole('checkbox', { name: /I agree to share/ }).check()
  await parentPage
    .getByRole('button', { name: 'Confirm and share number' })
    .click()
  await expect(parentPage.getByText('1 of 3 contacts shared')).toBeVisible()
})
