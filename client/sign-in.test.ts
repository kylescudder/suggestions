// Run in a separate Bun process so DOM globals and auth-client modules do not
// share a module cache with the server-rendering and database tests.
import assert from 'node:assert/strict'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  spyOn,
  test
} from 'bun:test'
import { Window } from 'happy-dom'
import { act, createElement } from 'react'
import type { Root } from 'react-dom/client'
import type { Profile } from '../src/lib/profile'
import type { QueryClient } from '@tanstack/react-query'

const browser = new Window({ url: 'https://suggestions.auth.test' })
const originalGlobals = new Map<string, PropertyDescriptor | undefined>()
let createRoot: typeof import('react-dom/client').createRoot
let AdminSignIn: typeof import('../src/components/AdminSignIn').AdminSignIn
let authClient: typeof import('../src/lib/auth-client').authClient
let progress: typeof import('../src/lib/pending-sign-in')
let UserProfile: typeof import('../src/components/auth/settings/account/user-profile').UserProfile
let AuthUIProvider: typeof import('../src/components/auth/auth-provider').AuthProvider
let profileUI: typeof import('../src/lib/profile-ui')
let emailOtpUI: typeof import('../src/lib/auth/email-otp-plugin')
let passkeyUI: typeof import('../src/lib/auth/passkey-plugin')
let profileSession = false
let profileUserId = 'first-user'
let queryTools: typeof import('@tanstack/react-query')
let profileClient: QueryClient | undefined
let profileState: Profile
let profileSave: unknown
let root: Root | undefined
let container: HTMLDivElement
let sends = 0
let signedIn = 0
let signInFails = false
let sendFails = false
let lastSend: unknown
let lastVerify: unknown
let sessionRequests = 0
let releaseSession: (() => void) | undefined
let delaySession = false
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>

beforeAll(async () => {
  const globals = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    Node: browser.Node,
    Element: browser.Element,
    Image: browser.Image,
    Event: browser.Event,
    InputEvent: browser.InputEvent,
    HTMLTextAreaElement: browser.HTMLTextAreaElement,
    HTMLSelectElement: browser.HTMLSelectElement,
    HTMLButtonElement: browser.HTMLButtonElement,
    HTMLDivElement: browser.HTMLDivElement,
    MutationObserver: browser.MutationObserver,
    ResizeObserver: browser.ResizeObserver,
    getComputedStyle: browser.getComputedStyle.bind(browser),
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true
  }
  for (const [key, value] of Object.entries(globals)) {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, value })
  }
  const mockFetch = Object.assign(
    async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const url = new URL(
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        browser.location.origin
      )
      if (url.pathname === '/api/profile') {
        if (init?.method === 'PATCH') {
          profileSave = JSON.parse(init.body as string)
          profileState = {
            ...profileState,
            ...(profileSave as Partial<Profile>)
          }
        }
        return Response.json(profileState)
      }
      if (url.pathname === '/api/profile/avatar' && init?.method === 'DELETE') {
        profileState = { ...profileState, image: null }
        return Response.json(profileState)
      }
      if (url.pathname === '/api/auth/update-user') {
        profileSave = JSON.parse(init?.body as string)
        profileState = { ...profileState, ...(profileSave as Partial<Profile>) }
        return Response.json({ status: true })
      }
      if (url.pathname === '/api/auth/get-session') {
        sessionRequests++
        if (delaySession)
          await new Promise<void>((resolve) => {
            releaseSession = resolve
          })
        return Response.json(
          profileSession
            ? {
                user: {
                  ...profileState,
                  id: profileUserId,
                  createdAt: '2026-01-01T00:00:00Z',
                  updatedAt: '2026-01-01T00:00:00Z'
                },
                session: {
                  id: 'disposable-session',
                  userId: profileUserId,
                  expiresAt: '2030-01-01T00:00:00Z',
                  createdAt: '2026-01-01T00:00:00Z',
                  updatedAt: '2026-01-01T00:00:00Z'
                }
              }
            : null
        )
      }
      if (url.pathname === '/api/auth/email-otp/send-verification-otp') {
        sends++
        lastSend = JSON.parse(init?.body as string)
        return sendFails
          ? Response.json(
              { code: 'SEND_FAILED', message: 'Unable to send a code' },
              { status: 500 }
            )
          : Response.json({ success: true })
      }
      if (url.pathname === '/api/auth/sign-in/email-otp') {
        lastVerify = JSON.parse(init?.body as string)
        return signInFails
          ? Response.json(
              { code: 'INVALID_OTP', message: 'Invalid code' },
              { status: 400 }
            )
          : Response.json({
              user: { emailVerified: true },
              token: 'disposable-test-token'
            })
      }
      throw new Error('Unexpected test request: ' + url.pathname)
    },
    { preconnect: globalThis.fetch.preconnect }
  )
  fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(mockFetch)
  ;({ createRoot } = await import('react-dom/client'))
  ;({ AdminSignIn } = await import('../src/components/AdminSignIn'))
  ;({ authClient } = await import('../src/lib/auth-client'))
  progress = await import('../src/lib/pending-sign-in')
  ;({ UserProfile } =
    await import('../src/components/auth/settings/account/user-profile'))
  ;({ AuthProvider: AuthUIProvider } =
    await import('../src/components/auth/auth-provider'))
  profileUI = await import('../src/lib/profile-ui')
  emailOtpUI = await import('../src/lib/auth/email-otp-plugin')
  passkeyUI = await import('../src/lib/auth/passkey-plugin')
  queryTools = await import('@tanstack/react-query')
})

beforeEach(() => {
  browser.sessionStorage.clear()
  sends = 0
  signedIn = 0
  signInFails = false
  sendFails = false
  lastSend = undefined
  lastVerify = undefined
  delaySession = false
  releaseSession = undefined
  profileSession = false
  profileUserId = 'first-user'
  profileSave = undefined
  profileState = {
    name: 'Original Name',
    givenName: '',
    familyName: '',
    email: 'admin@example.com',
    emailVerified: true,
    image: '/api/profile/avatar?v=disposable-test'
  }
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(async () => {
  releaseSession?.()
  await act(async () => root?.unmount())
  root = undefined
  profileClient?.clear()
  profileClient = undefined
  container.remove()
})

afterAll(async () => {
  // Nanostores delays session-store unmount cleanup by one second.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  fetchSpy.mockRestore()
  await browser.happyDOM.abort()
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

async function mount(withSession = false) {
  function SignInWithSession() {
    const session = authClient.useSession()
    return createElement(AdminSignIn, {
      sessionPending: session.isPending
    })
  }
  profileClient ??= new queryTools.QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(
        AuthUIProvider,
        {
          authClient,
          queryClient: profileClient,
          navigate: ({ to }) => {
            assert.equal(to, '/profile')
            signedIn++
          },
          redirectTo: '/profile',
          emailAndPassword: { enabled: false },
          plugins: [emailOtpUI.emailOtpPlugin(), passkeyUI.passkeyPlugin()]
        },
        withSession
          ? createElement(SignInWithSession)
          : createElement(AdminSignIn)
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  // The session store begins its fetch after React's mount effects run.
  if (withSession)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
}

function browserEvent(type: string, cancelable = false): Event {
  // Happy DOM's Event implements the DOM contract with a separate TS type.
  return new browser.Event(type, {
    bubbles: true,
    cancelable
  }) as unknown as Event
}

async function input(id: string, value: string) {
  const element = container.querySelector<HTMLInputElement>(
    id === 'admin-email' ? 'input[name="email"]' : 'input[name="code"]'
  )!
  assert.ok(element)
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      browser.HTMLInputElement.prototype,
      'value'
    )!.set!.call(element, value)
    element.dispatchEvent(browserEvent('input'))
  })
}

async function submit() {
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(browserEvent('submit', true))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
}

async function click(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (element) => element.textContent?.trim() === text
  )
  assert.ok(button, 'Button missing: ' + text)
  await act(async () => button.click())
}

test('email-code progress survives remount without persisting the code or resending email', async () => {
  await mount()
  await input('admin-email', 'admin@example.com')
  await submit()
  await input('admin-code', '123456')
  assert.equal(sends, 1)
  const pending = progress.readPendingSignIn()!
  assert.equal(pending.email, 'admin@example.com')
  assert.deepEqual(Object.keys(pending).sort(), ['email', 'sentAt'])
  assert.ok(
    !browser.sessionStorage
      .getItem(browser.sessionStorage.key(0)!)!
      .includes('123456')
  )

  await act(async () => root!.unmount())
  await mount()
  assert.match(container.textContent!, /admin@example.com/)
  assert.equal(
    container.querySelector<HTMLInputElement>('input[name="code"]')!.value,
    ''
  )
  assert.match(container.textContent!, /Resend in \d+s/)
  assert.equal(sends, 1, 'Restoring a form must not rotate or resend its code')
})

test('real auth-client visibility refresh retains the mounted code field and its draft', async () => {
  await mount(true)
  await input('admin-email', 'admin@example.com')
  await submit()
  await input('admin-code', '123')
  const field = container.querySelector('input[name="code"]')
  const requestsBefore = sessionRequests
  delaySession = true
  await act(async () => {
    document.dispatchEvent(browserEvent('visibilitychange'))
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  assert.ok(
    sessionRequests > requestsBefore,
    'Visibility change did not trigger a session refresh'
  )
  assert.match(container.textContent!, /Checking sign-in/)
  assert.equal(container.querySelector('input[name="code"]'), field)
  assert.equal(
    container.querySelector<HTMLInputElement>('input[name="code"]')!.value,
    '123'
  )
  await act(async () => {
    delaySession = false
    releaseSession!()
    await new Promise((resolve) => setTimeout(resolve, 10))
  })
  assert.equal(container.querySelector('input[name="code"]'), field)
  assert.equal(
    container.querySelector<HTMLInputElement>('input[name="code"]')!.value,
    '123'
  )
  assert.equal(sends, 1)
})

test('resuming recalculates cooldown and expires old codes using elapsed wall time', async () => {
  const startedAt = Date.now()
  progress.savePendingSignIn({
    email: 'admin@example.com',
    sentAt: startedAt - 65_000
  })
  await mount()
  assert.ok(container.querySelector('input[name="code"]'))
  assert.ok(
    Array.from(container.querySelectorAll('button')).some(
      (button) => button.textContent === 'Resend' && !button.disabled
    )
  )
  const clock = spyOn(Date, 'now').mockReturnValue(
    startedAt + progress.emailCodeLifetime
  )
  try {
    await act(async () =>
      document.dispatchEvent(browserEvent('visibilitychange'))
    )
    assert.equal(container.querySelector('input[name="code"]'), null)
    assert.match(container.textContent!, /code has expired/)
    assert.equal(progress.readPendingSignIn(), null)
    assert.equal(
      container.querySelector<HTMLInputElement>('input[name="email"]')!.value,
      'admin@example.com'
    )
  } finally {
    clock.mockRestore()
  }
})

test('changing email clears progress, failed verification preserves it, and success clears it', async () => {
  await mount()
  await input('admin-email', 'admin@example.com')
  await submit()
  await click('Use a different email')
  assert.equal(progress.readPendingSignIn(), null)
  assert.equal(container.querySelector('input[name="code"]'), null)
  await input('admin-email', 'other@example.com')
  await submit()
  await input('admin-code', '123456')
  signInFails = true
  await submit()
  assert.equal(signedIn, 0)
  assert.equal(progress.readPendingSignIn()?.email, 'other@example.com')
  assert.match(container.textContent!, /code could not be verified/)
  signInFails = false
  await submit()
  assert.equal(signedIn, 1)
  assert.equal(progress.readPendingSignIn(), null)
})

test('invalid, future and expired stored progress is discarded', () => {
  const key = 'suggestions.pending-email-sign-in.v1'
  for (const value of [
    'not-json',
    JSON.stringify({ email: 'admin@example.com', sentAt: Date.now() + 60_000 }),
    JSON.stringify({
      email: 'admin@example.com',
      sentAt: Date.now() - progress.emailCodeLifetime
    })
  ]) {
    browser.sessionStorage.setItem(key, value)
    assert.equal(progress.readPendingSignIn(), null)
  }
})

test('blocked session storage does not prevent sending or entering a code', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(browser, 'sessionStorage')
  Object.defineProperty(browser, 'sessionStorage', {
    configurable: true,
    get() {
      throw new Error('Storage blocked')
    }
  })
  try {
    await mount()
    await input('admin-email', 'admin@example.com')
    await submit()
    await input('admin-code', '123456')
    await submit()
    assert.equal(sends, 1)
    assert.equal(signedIn, 1)
  } finally {
    if (descriptor) Object.defineProperty(browser, 'sessionStorage', descriptor)
    else Reflect.deleteProperty(browser, 'sessionStorage')
  }
})

test('shadcn Better Auth UI preserves drafts through session/photo refresh and isolates account changes', async () => {
  profileSession = true
  profileClient = new queryTools.QueryClient({
    defaultOptions: { queries: { retry: false } }
  })
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(
        AuthUIProvider,
        {
          authClient,
          queryClient: profileClient,
          navigate: () => {},
          emailAndPassword: { enabled: false },
          additionalFields: profileUI.profileFields,
          avatar: profileUI.profileAvatar,
          localization: { auth: { name: 'Display name' } }
        },
        createElement(UserProfile)
      )
    )
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  const email = container.querySelector<HTMLInputElement>(
    'input[name$="email"]'
  )!
  assert.ok(email)
  assert.equal(email.readOnly, true)
  const fill = async (suffix: string, value: string) => {
    const field = container.querySelector<HTMLInputElement>(
      `input[name$="${suffix}"]`
    )!
    assert.ok(field, 'Profile field missing: ' + suffix)
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        browser.HTMLInputElement.prototype,
        'value'
      )!.set!.call(field, value)
      field.dispatchEvent(browserEvent('input'))
    })
  }
  await fill('name', 'Unsaved draft')
  await fill('givenName', 'Given')
  await fill('familyName', 'Family')
  // A photo change or focus refetch replaces the session object, but must not
  // reset the shadcn profile form's unsaved name fields.
  profileState = { ...profileState, image: null }
  await act(async () => {
    await profileClient!.invalidateQueries()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  assert.equal(
    container.querySelector<HTMLInputElement>('input[name="name"]')!.value,
    'Unsaved draft'
  )
  await submit()
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  assert.ok(profileSave, container.textContent ?? 'Profile submit did not run')
  assert.deepEqual(profileSave, {
    name: 'Unsaved draft',
    givenName: 'Given',
    familyName: 'Family'
  })
  assert.equal(email.value, 'admin@example.com')
  await fill('name', 'Private unfinished draft')
  profileUserId = 'second-user'
  profileState = {
    ...profileState,
    name: 'Other account',
    givenName: '',
    familyName: '',
    email: 'second@example.com'
  }
  await act(async () => {
    await profileClient!.invalidateQueries()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  assert.equal(
    container.querySelector<HTMLInputElement>('input[name="name"]')!.value,
    'Other account'
  )
  assert.equal(
    container.querySelector<HTMLInputElement>('input[name$="email"]')!.value,
    'second@example.com'
  )
})

test('sign-in renders the shadcn card and six code slots, normalizes email, and verifies only on submit', async () => {
  await mount()
  const card = container.querySelector('[data-slot="card"]')!
  assert.ok(card)
  assert.match(card.className, /bg-card/)
  assert.doesNotMatch(card.className, /backdrop-blur|bg-white\/10/)
  assert.ok(
    container.querySelector('[data-slot="button"][data-variant="outline"]'),
    'Native passkey button missing'
  )
  assert.equal(container.querySelector('input[type="password"]'), null)
  await input('admin-email', ' ADMIN@EXAMPLE.COM ')
  await submit()
  assert.deepEqual(lastSend, { email: 'admin@example.com', type: 'sign-in' })
  assert.equal(
    container.querySelectorAll('[data-slot="input-otp-slot"]').length,
    6
  )
  await input('admin-code', '123456')
  assert.equal(
    lastVerify,
    undefined,
    'Entering a code must not submit it automatically'
  )
  await submit()
  assert.deepEqual(lastVerify, { email: 'admin@example.com', otp: '123456' })
  assert.equal(signedIn, 1)
})

test('failed send stays on the shadcn email form without saving progress or sending automatically on remount', async () => {
  await mount()
  sendFails = true
  await input('admin-email', 'admin@example.com')
  await submit()
  assert.ok(container.querySelector('input[name="email"]'))
  assert.equal(container.querySelector('input[name="code"]'), null)
  assert.equal(progress.readPendingSignIn(), null)
  assert.equal(sends, 1)
  await act(async () => root!.unmount())
  await mount()
  assert.equal(sends, 1)
})
