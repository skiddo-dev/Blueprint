<script lang="ts">
  import { dndzone, TRIGGERS } from 'svelte-dnd-action'
  import TaskCard from './TaskCard.svelte'
  import type { Task, TaskStatus } from '$lib/types'
  import { STATUS_META } from '$lib/constants'

  let {
    status,
    tasks,
    assignees,
    onConsider,
    onFinalize,
    onFieldUpdate,
    onDelete,
  }: {
    status: TaskStatus
    tasks: Task[]
    assignees: string[]
    onConsider: (status: TaskStatus, items: Task[]) => void
    onFinalize: (status: TaskStatus, items: Task[], droppedId: string | null) => void
    onFieldUpdate: (id: string, field: string, value: unknown) => void
    onDelete: (id: string) => void
  } = $props()

  const meta = $derived(STATUS_META[status])
  const flipDurationMs = 200

  let items = $state<Task[]>([...tasks])
  let isDragging = $state(false)

  $effect(() => {
    if (!isDragging) items = [...tasks]
  })

  function handleConsider(e: CustomEvent) {
    isDragging = true
    items = e.detail.items as Task[]
    onConsider(status, items)
  }

  function handleFinalize(e: CustomEvent) {
    isDragging = false
    items = e.detail.items as Task[]
    const droppedId =
      e.detail.info.trigger === TRIGGERS.DROPPED_INTO_ZONE
        ? (e.detail.info.id as string)
        : null
    onFinalize(status, items, droppedId)
  }
</script>

<div class="column">
  <div class="col-header" style:background={meta.bg} style:border-left-color={meta.color}>
    <span class="col-title" style:color={meta.text}>
      {meta.icon}&nbsp;{status}
    </span>
    <span class="count" style:background={meta.color}>{tasks.length}</span>
  </div>

  <!-- svelte-dnd-action dispatches consider/finalize as custom DOM events -->
  <!-- svelte-ignore event_directive_deprecated -->
  <div
    class="dropzone"
    use:dndzone={{ items, type: 'task', flipDurationMs }}
    on:consider={handleConsider}
    on:finalize={handleFinalize}
  >
    {#each items as task (task._id)}
      <TaskCard
        {task}
        {assignees}
        {onFieldUpdate}
        {onDelete}
      />
    {/each}

    {#if items.length === 0}
      <div class="empty-zone">No tasks</div>
    {/if}
  </div>
</div>

<style>
  .column {
    min-width: 240px;
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  .col-header {
    border-radius: 10px;
    padding: 10px 14px;
    margin-bottom: 10px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-left: 4px solid transparent;
  }
  .col-title {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  .count {
    color: #fff;
    border-radius: 20px;
    padding: 2px 10px;
    font-size: 12px;
    font-weight: 700;
    min-width: 26px;
    text-align: center;
  }

  .dropzone {
    flex: 1;
    min-height: 80px;
    border-radius: 8px;
    padding: 4px 2px;
    outline: none;
  }
  .dropzone:focus-visible {
    outline: 2px dashed #6366f1;
  }

  .empty-zone {
    text-align: center;
    padding: 24px 8px;
    color: #cbd5e1;
    border: 2px dashed #e2e8f0;
    border-radius: 8px;
    font-size: 12px;
    pointer-events: none;
  }

  @media (max-width: 768px) {
    .column { min-width: 100%; width: 100%; }
  }
</style>
