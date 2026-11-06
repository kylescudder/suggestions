import { useState } from 'react'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import { authClient } from '@/lib/auth-client'

export function PasskeySettings() {
  const { data: passkeys, isPending } = authClient.useListPasskeys()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function add() {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await authClient.passkey.addPasskey({
        name: name.trim() || 'My passkey'
      })
      if (!result || result.error) {
        setError(
          'Passkey registration was not completed. Sign in again with an email code if your session is too old.'
        )
        return
      }
      setName('')
      setMessage('Passkey saved. You can use it the next time you sign in.')
    } catch {
      setError(
        'Unable to save a passkey. Check that your browser or password manager supports passkeys.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await authClient.passkey.deletePasskey({ id })
      if (result.error) setError('Unable to remove that passkey.')
      else setMessage('Passkey removed. Email-code sign-in is still available.')
    } catch {
      setError('Unable to remove that passkey. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      aria-labelledby='passkeys-title'
      className='mx-auto mt-8 max-w-3xl rounded-xl border border-white/20 bg-white/10 p-6 text-white backdrop-blur-md'
    >
      <h2
        id='passkeys-title'
        className='flex items-center gap-2 text-xl font-semibold'
      >
        <KeyRound className='h-5 w-5' />
        Your passkeys
      </h2>
      <p className='mt-2 text-sm text-purple-100'>
        Save a passkey to sign in with your device or password manager. Email
        codes remain available for recovery.
      </p>
      <form
        className='mt-4 flex flex-wrap gap-3'
        onSubmit={(event) => {
          event.preventDefault()
          void add()
        }}
      >
        <label className='sr-only' htmlFor='passkey-name'>
          Passkey name
        </label>
        <input
          id='passkey-name'
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={64}
          placeholder='e.g. My password manager'
          className='min-w-0 grow rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-white placeholder:text-purple-200/70 focus:ring-2 focus:ring-purple-300 focus:outline-none'
        />
        <button
          type='submit'
          disabled={busy}
          className='flex items-center gap-2 rounded-lg bg-purple-400 px-4 py-2 font-semibold text-purple-950 hover:bg-purple-300 disabled:opacity-60'
        >
          <Plus className='h-4 w-4' />
          Add passkey
        </button>
      </form>
      {isPending ? (
        <p className='mt-4 text-sm text-purple-100'>Loading passkeys…</p>
      ) : passkeys?.length ? (
        <ul className='mt-4 divide-y divide-white/20'>
          {passkeys.map((passkey) => (
            <li
              key={passkey.id}
              className='flex items-center justify-between gap-3 py-3'
            >
              <span className='min-w-0 break-words'>
                {passkey.name || 'Passkey'}
              </span>
              <button
                type='button'
                disabled={busy}
                onClick={() => void remove(passkey.id)}
                aria-label={`Remove ${passkey.name || 'passkey'}`}
                className='shrink-0 rounded-lg p-2 text-purple-100 hover:bg-white/10 disabled:opacity-60'
              >
                <Trash2 className='h-4 w-4' />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className='mt-4 text-sm text-purple-100'>No passkeys saved yet.</p>
      )}
      {message && (
        <p role='status' className='mt-4 text-sm text-green-200'>
          {message}
        </p>
      )}
      {error && (
        <p role='alert' className='mt-4 text-sm text-red-200'>
          {error}
        </p>
      )}
    </section>
  )
}
