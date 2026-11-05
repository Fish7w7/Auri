import type { WorkCreationReview, WorkCreationReviewRequest } from '@shared/contracts'

type ReviewOptions<T> = {
  draft: WorkCreationReviewRequest
  preview(draft: WorkCreationReviewRequest): Promise<WorkCreationReview>
  save(reviewedWorkIds?: string[]): Promise<T>
  reviewedWorkIds?: string[]
  forceReview?: boolean
}

export type CreationReviewFailure = { error: unknown; refreshFailed: boolean }

// Bridge errors may contain only message/stack. Re-read after every rejected write;
// never infer internal codes from translated messages or repeat the write here.
export async function refreshRejectedWorkCreation(
  draft: WorkCreationReviewRequest,
  preview: ReviewOptions<unknown>['preview'],
  error: unknown,
  fallback: WorkCreationReview
): Promise<{ kind: 'review'; review: WorkCreationReview; failure: CreationReviewFailure }> {
  try { return { kind: 'review', review: await preview(draft), failure: { error, refreshFailed: false } } }
  catch { return { kind: 'review', review: fallback, failure: { error, refreshFailed: true } } }
}

// All entry points use the same gate. The backend remains authoritative inside IMMEDIATE.
export async function reviewWorkCreation<T>({ draft, preview, save, reviewedWorkIds, forceReview }: ReviewOptions<T>): Promise<
  { kind: 'review'; review: WorkCreationReview; failure?: CreationReviewFailure } | { kind: 'saved'; value: T }
> {
  const review = await preview(draft)
  if (forceReview || !review.canKeepSeparate || review.candidates.some((candidate) => !reviewedWorkIds?.includes(candidate.work.id))) {
    return { kind: 'review', review }
  }
  try { return { kind: 'saved', value: await save(reviewedWorkIds) } }
  catch (error) { return refreshRejectedWorkCreation(draft, preview, error, review) }
}

// Search effects invalidate their requests on review changes, processing and unmount.
export function createReviewRequestGuard() {
  let current = 0
  return {
    invalidate() { current += 1 },
    start() { const id = ++current; return () => id === current }
  }
}
