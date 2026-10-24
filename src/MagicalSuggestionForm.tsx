import { useState } from 'react'
import { api } from './api'
import { toast } from 'sonner'
import { Confetti } from './Confetti'

export function MagicalSuggestionForm() {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [authorName, setAuthorName] = useState('')
  const [authorEmail, setAuthorEmail] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfetti, setShowConfetti] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in your magical idea and description!')
      return
    }

    setIsSubmitting(true)
    try {
      await api.createSuggestion({
        title: title.trim(),
        description: description.trim(),
        authorName: authorName.trim() || undefined,
        authorEmail: authorEmail.trim() || undefined
      })

      // Show confetti celebration
      setShowConfetti(true)
      toast.success('✨ Your magical idea has been captured!')

      // Clear form
      setTitle('')
      setDescription('')
      setAuthorName('')
      setAuthorEmail('')
    } catch (error) {
      toast.error('Oops! The magic failed. Please try again.')
      console.error(error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfettiComplete = () => {
    setShowConfetti(false)
  }

  return (
    <>
      <Confetti isActive={showConfetti} onComplete={handleConfettiComplete} />

      <div className='mx-auto mt-12 max-w-2xl'>
        <div className='mb-8 text-center'>
          <h1 className='mb-4 animate-pulse text-5xl font-bold text-white'>
            Share Your Spark of Magic!
          </h1>
          <p className='mb-8 text-xl text-purple-200'>
            Your ideas help make our workplace better. ✨
          </p>
        </div>

        <div className='magical-glow rounded-3xl border border-white/20 bg-white/10 p-8 shadow-2xl backdrop-blur-md'>
          <form onSubmit={handleSubmit} className='space-y-6'>
            <div className='space-y-2'>
              <label
                htmlFor='title'
                className='block text-lg font-medium text-white'
              >
                Your Magical Idea
              </label>
              <input
                type='text'
                id='title'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className='w-full rounded-xl border border-white/30 bg-white/20 px-4 py-3 text-white placeholder-purple-200 backdrop-blur-xs transition-all duration-300 focus:border-transparent focus:ring-2 focus:ring-purple-400 focus:outline-hidden'
                placeholder="What's your brilliant idea? ✨"
                disabled={isSubmitting}
              />
            </div>

            <div className='space-y-2'>
              <label
                htmlFor='description'
                className='block text-lg font-medium text-white'
              >
                Tell us more about your magic
              </label>
              <textarea
                id='description'
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className='w-full resize-none rounded-xl border border-white/30 bg-white/20 px-4 py-3 text-white placeholder-purple-200 backdrop-blur-xs transition-all duration-300 focus:border-transparent focus:ring-2 focus:ring-purple-400 focus:outline-hidden'
                placeholder='Describe your magical vision in detail...'
                disabled={isSubmitting}
              />
            </div>

            <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <label
                  htmlFor='name'
                  className='block text-lg font-medium text-white'
                >
                  Your name (optional)
                </label>
                <input
                  type='text'
                  id='name'
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className='w-full rounded-xl border border-white/30 bg-white/20 px-4 py-3 text-white placeholder-purple-200 backdrop-blur-xs transition-all duration-300 focus:border-transparent focus:ring-2 focus:ring-purple-400 focus:outline-hidden'
                  placeholder='Your magical name'
                  disabled={isSubmitting}
                />
              </div>

              <div className='space-y-2'>
                <label
                  htmlFor='email'
                  className='block text-lg font-medium text-white'
                >
                  Your email (optional)
                </label>
                <input
                  type='email'
                  id='email'
                  value={authorEmail}
                  onChange={(e) => setAuthorEmail(e.target.value)}
                  className='w-full rounded-xl border border-white/30 bg-white/20 px-4 py-3 text-white placeholder-purple-200 backdrop-blur-xs transition-all duration-300 focus:border-transparent focus:ring-2 focus:ring-purple-400 focus:outline-hidden'
                  placeholder='your@email.com'
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <button
              type='submit'
              disabled={isSubmitting || !title.trim() || !description.trim()}
              className='magical-button w-full transform rounded-xl bg-linear-to-r from-purple-500 to-pink-500 px-6 py-4 font-bold text-white transition-all duration-300 hover:scale-105 hover:from-purple-600 hover:to-pink-600 focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-transparent focus:outline-hidden disabled:cursor-not-allowed disabled:opacity-50'
            >
              {isSubmitting ? (
                <span className='flex items-center justify-center gap-2'>
                  <div className='h-5 w-5 animate-spin rounded-full border-b-2 border-white'></div>
                  Casting your spell...
                </span>
              ) : (
                '✨ Share Your Magic ✨'
              )}
            </button>
          </form>

          <div className='mt-6 text-center'>
            <p className='text-purple-200 italic'>
              Every great idea starts with a single spark
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
