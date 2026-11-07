import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, UserRound } from 'lucide-react'
import { prepareAvatar, profileRequest } from '@/lib/profile'
import type { Profile } from '@/lib/profile'

const inputClass =
  'mt-2 w-full min-w-0 rounded-lg border border-white/30 bg-white/10 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-300'

export function ProfileEditor({
  userId,
  onUpdated
}: {
  userId: string
  onUpdated: () => Promise<void>
}) {
  const queryClient = useQueryClient()
  const queryKey = ['profile', userId]
  const query = useQuery({
    queryKey,
    queryFn: () => profileRequest(),
    refetchOnWindowFocus: false
  })
  if (query.isPending)
    return (
      <p role='status' className='py-8 text-purple-100'>
        Loading your profile…
      </p>
    )
  if (query.error && !query.data)
    return (
      <div role='alert' className='py-8 text-red-100'>
        {query.error.message}
        <button
          type='button'
          className='ml-3 underline'
          onClick={() => void query.refetch()}
        >
          Try again
        </button>
      </div>
    )
  return (
    <ProfileForm
      key={userId}
      profile={query.data}
      onUpdated={async (profile) => {
        queryClient.setQueryData(queryKey, profile)
        await onUpdated()
      }}
    />
  )
}

function ProfileForm({
  profile,
  onUpdated
}: {
  profile: Profile
  onUpdated: (profile: Profile) => Promise<void>
}) {
  // Keep name drafts across session refreshes and photo changes.
  const [name, setName] = useState(profile.name)
  const [givenName, setGivenName] = useState(profile.givenName)
  const [familyName, setFamilyName] = useState(profile.familyName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  async function update(action: () => Promise<Profile>, message: string) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await onUpdated(await action())
      setMessage(message)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to save your profile.'
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section
      aria-labelledby='profile-details-title'
      className='rounded-xl border border-white/20 bg-white/10 p-6 text-white backdrop-blur-md'
    >
      <h2 id='profile-details-title' className='text-2xl font-semibold'>
        Profile details
      </h2>
      <div className='my-6 flex flex-wrap items-center gap-5'>
        <div className='flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/30 bg-purple-400/20'>
          {profile.image ? (
            <img
              src={profile.image}
              alt='Your profile'
              width={96}
              height={96}
              className='h-full w-full object-cover'
            />
          ) : (
            <UserRound
              aria-hidden='true'
              className='h-12 w-12 text-purple-100'
            />
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <label className='inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/30 px-4 py-2 focus-within:ring-2 focus-within:ring-purple-300'>
            <Camera aria-hidden='true' className='h-4 w-4' /> Change photo
            <input
              type='file'
              accept='image/jpeg,image/png,image/webp'
              aria-label='Change profile photo'
              disabled={busy}
              className='sr-only'
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file)
                  void update(
                    async () =>
                      profileRequest('/api/profile/avatar', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'image/jpeg' },
                        body: await prepareAvatar(file)
                      }),
                    'Photo updated.'
                  )
              }}
            />
          </label>
          {profile.image && (
            <button
              type='button'
              disabled={busy}
              className='mt-2 ml-3 underline underline-offset-4 disabled:opacity-60'
              onClick={() =>
                void update(
                  () =>
                    profileRequest('/api/profile/avatar', { method: 'DELETE' }),
                  'Photo removed.'
                )
              }
            >
              Remove photo
            </button>
          )}
          <p className='mt-2 text-sm text-purple-100'>
            JPEG, PNG or WebP, up to 10 MB. Photos are cropped to a square.
          </p>
        </div>
      </div>
      <form
        className='space-y-5'
        onSubmit={(event) => {
          event.preventDefault()
          void update(
            () =>
              profileRequest('/api/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, givenName, familyName })
              }),
            'Profile saved.'
          )
        }}
      >
        <div className='grid min-w-0 gap-5 sm:grid-cols-2'>
          <label className='min-w-0'>
            First name <span className='text-purple-200'>(optional)</span>
            <input
              id='profile-givenName'
              name='givenName'
              autoComplete='given-name'
              value={givenName}
              maxLength={100}
              disabled={busy}
              onChange={(event) => setGivenName(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className='min-w-0'>
            Last name <span className='text-purple-200'>(optional)</span>
            <input
              id='profile-familyName'
              name='familyName'
              autoComplete='family-name'
              value={familyName}
              maxLength={100}
              disabled={busy}
              onChange={(event) => setFamilyName(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
        <label className='block'>
          Display name
          <input
            id='profile-name'
            name='name'
            autoComplete='nickname'
            value={name}
            maxLength={120}
            required
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className='block'>
          Email address
          <input
            id='profile-email'
            name='email'
            type='email'
            autoComplete='email'
            readOnly
            value={profile.email}
            className={inputClass + ' opacity-80'}
          />
          <span className='mt-2 block text-sm text-purple-100'>
            {profile.emailVerified
              ? 'Verified email · used for sign-in'
              : 'Email not verified'}
          </span>
        </label>
        <button
          type='submit'
          disabled={busy}
          className='rounded-lg bg-purple-400 px-5 py-3 font-semibold text-purple-950 hover:bg-purple-300 disabled:opacity-60'
        >
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      </form>
      {error && (
        <p
          role='alert'
          className='mt-4 rounded-lg border border-red-300/40 bg-red-950/30 p-3 text-red-100'
        >
          {error}
        </p>
      )}
      {message && (
        <p role='status' className='mt-4 text-green-200'>
          {message}
        </p>
      )}
    </section>
  )
}
