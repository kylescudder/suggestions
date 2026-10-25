import { useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient
} from '@tanstack/react-query'
import { TRPCClientError } from '@trpc/client'
import { useTRPC } from '@/lib/trpc'
import type { STATUSES } from '@/server/trpc'
import { toast } from 'sonner'
import { Hourglass, Eye, CheckCircle2, XCircle, Sparkles } from 'lucide-react'

export function AdminDashboard() {
  type Status = (typeof STATUSES)[number]
  const [selectedStatus, setSelectedStatus] = useState<Status | ''>('')
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const list = useQuery(
    trpc.suggestions.list.queryOptions(
      { status: selectedStatus || undefined },
      // Keep the current list on screen while another filter loads.
      { placeholderData: keepPreviousData }
    )
  )
  const statsQuery = useQuery(trpc.suggestions.stats.queryOptions())
  const updateStatus = useMutation(
    trpc.suggestions.updateStatus.mutationOptions()
  )
  const suggestions = list.data
  const stats = statsQuery.data
  const loadError = list.error ?? statsQuery.error

  const handleStatusChange = async (
    suggestionId: number,
    newStatus: Status
  ) => {
    try {
      await updateStatus.mutateAsync({ id: suggestionId, status: newStatus })
      await queryClient.invalidateQueries({
        queryKey: trpc.suggestions.pathKey()
      })
      toast.success('Status updated successfully!')
    } catch (error) {
      toast.error('Failed to update status')
      console.error(error)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'implemented':
        return 'bg-green-500/20 text-green-300 border-green-500/30'
      case 'reviewed':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
      case 'rejected':
        return 'bg-red-500/20 text-red-300 border-red-500/30'
      default:
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'implemented':
        return <CheckCircle2 className='h-4 w-4' />
      case 'reviewed':
        return <Eye className='h-4 w-4' />
      case 'rejected':
        return <XCircle className='h-4 w-4' />
      default:
        return <Hourglass className='h-4 w-4' />
    }
  }

  if (loadError) {
    return (
      <p className='py-20 text-center text-xl text-white'>
        {loadError instanceof TRPCClientError &&
        loadError.data?.code === 'FORBIDDEN'
          ? "Your account doesn't have admin access."
          : 'Failed to load suggestions.'}
      </p>
    )
  }

  if (suggestions === undefined || stats === undefined) {
    return (
      <div className='flex items-center justify-center py-20'>
        <div className='h-12 w-12 animate-spin rounded-full border-b-2 border-white'></div>
      </div>
    )
  }

  return (
    <div className='mx-auto max-w-6xl'>
      <div className='mb-8 text-center'>
        <h1 className='mb-4 flex items-center justify-center gap-2 text-4xl font-bold text-white'>
          <Sparkles className='h-7 w-7' />
          Admin Dashboard
          <Sparkles className='h-7 w-7' />
        </h1>
        <p className='text-lg text-purple-200'>
          Manage the magical ideas from your community
        </p>
      </div>

      {/* Stats Cards */}
      <div className='mb-8 grid grid-cols-2 gap-4 md:grid-cols-5'>
        <div
          className={`cursor-pointer rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:bg-white/20 ${selectedStatus === '' ? 'ring-2 ring-purple-400' : ''}`}
          onClick={() => setSelectedStatus('')}
        >
          <div className='text-center'>
            <div className='text-2xl font-bold text-white'>{stats.all}</div>
            <div className='text-sm text-purple-200'>All Ideas</div>
          </div>
        </div>

        <div
          className={`cursor-pointer rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:bg-white/20 ${selectedStatus === 'pending' ? 'ring-2 ring-yellow-400' : ''}`}
          onClick={() => setSelectedStatus('pending')}
        >
          <div className='text-center'>
            <div className='text-2xl font-bold text-yellow-300'>
              {stats.pending}
            </div>
            <div className='flex items-center justify-center gap-1 text-sm text-purple-200'>
              <Hourglass className='h-4 w-4' /> Pending
            </div>
          </div>
        </div>

        <div
          className={`cursor-pointer rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:bg-white/20 ${selectedStatus === 'reviewed' ? 'ring-2 ring-blue-400' : ''}`}
          onClick={() => setSelectedStatus('reviewed')}
        >
          <div className='text-center'>
            <div className='text-2xl font-bold text-blue-300'>
              {stats.reviewed}
            </div>
            <div className='flex items-center justify-center gap-1 text-sm text-purple-200'>
              <Eye className='h-4 w-4' /> Reviewed
            </div>
          </div>
        </div>

        <div
          className={`cursor-pointer rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:bg-white/20 ${selectedStatus === 'implemented' ? 'ring-2 ring-green-400' : ''}`}
          onClick={() => setSelectedStatus('implemented')}
        >
          <div className='text-center'>
            <div className='text-2xl font-bold text-green-300'>
              {stats.implemented}
            </div>
            <div className='flex items-center justify-center gap-1 text-sm text-purple-200'>
              <CheckCircle2 className='h-4 w-4' /> Implemented
            </div>
          </div>
        </div>

        <div
          className={`cursor-pointer rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-md transition-all duration-300 hover:bg-white/20 ${selectedStatus === 'rejected' ? 'ring-2 ring-red-400' : ''}`}
          onClick={() => setSelectedStatus('rejected')}
        >
          <div className='text-center'>
            <div className='text-2xl font-bold text-red-300'>
              {stats.rejected}
            </div>
            <div className='flex items-center justify-center gap-1 text-sm text-purple-200'>
              <XCircle className='h-4 w-4' /> Rejected
            </div>
          </div>
        </div>
      </div>

      {/* Filter Info */}
      <div className='mb-6'>
        <p className='text-center text-purple-200'>
          {selectedStatus
            ? `Showing ${selectedStatus} suggestions`
            : 'Showing all suggestions'}
          ({suggestions.length} total)
        </p>
      </div>

      {/* Suggestions List */}
      {suggestions.length === 0 ? (
        <div className='py-12 text-center'>
          <Sparkles className='mx-auto mb-4 h-16 w-16 text-white/80' />
          <p className='text-xl text-white'>No magical ideas yet!</p>
          <p className='text-purple-200'>
            Encourage your community to share their sparks.
          </p>
        </div>
      ) : (
        <div className='space-y-4'>
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className='magical-glow rounded-xl border border-white/20 bg-white/10 p-6 backdrop-blur-md'
            >
              <div className='mb-4 flex items-start justify-between'>
                <div className='flex-1'>
                  <h3 className='mb-2 flex items-center gap-2 text-xl font-semibold text-white'>
                    <Sparkles className='h-5 w-5' /> {suggestion.title}
                  </h3>
                  <div className='mb-3 flex items-center gap-3'>
                    <span
                      className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${getStatusColor(suggestion.status)}`}
                    >
                      {getStatusIcon(suggestion.status)} {suggestion.status}
                    </span>
                    <span className='text-sm text-purple-200'>
                      {new Date(suggestion.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {(suggestion.authorName || suggestion.authorEmail) && (
                    <p className='mb-3 text-sm text-purple-200'>
                      By: {suggestion.authorName || 'Anonymous'}
                      {suggestion.authorEmail && ` (${suggestion.authorEmail})`}
                    </p>
                  )}
                </div>
                <div className='ml-4'>
                  <select
                    value={suggestion.status}
                    onChange={(e) =>
                      handleStatusChange(
                        suggestion.id,
                        e.target.value as Status
                      )
                    }
                    className='rounded-lg border border-white/30 bg-white/20 px-3 py-2 text-white backdrop-blur-xs focus:ring-2 focus:ring-purple-400 focus:outline-hidden'
                  >
                    <option value='pending' className='bg-gray-800'>
                      Pending
                    </option>
                    <option value='reviewed' className='bg-gray-800'>
                      Reviewed
                    </option>
                    <option value='implemented' className='bg-gray-800'>
                      Implemented
                    </option>
                    <option value='rejected' className='bg-gray-800'>
                      Rejected
                    </option>
                  </select>
                </div>
              </div>
              <p className='leading-relaxed text-purple-100'>
                {suggestion.description}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
