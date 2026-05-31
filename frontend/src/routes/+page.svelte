<script lang="ts">
  import { onMount } from 'svelte';
  import { fetchTasks, syncing, loading, error, syncEmails } from '$lib/api';
  import { tasks } from '$lib/stores';
  import type { Task } from '$lib/types';

  // Reactive store binding
  $: taskList = $tasks;

  onMount(() => {
    console.log('✅ Frontend mounted');
    fetchTasks();
  });
</script>

<div class="min-h-screen bg-gray-50">
  <header class="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
    <div>
      <h1 class="text-2xl font-bold text-gray-800">🏗️ Blueprint</h1>
      <p class="text-sm text-gray-500">Email-to-Task Kanban</p>
    </div>
    <button
      onclick={() => syncEmails()}
      disabled={$syncing}
      class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium"
    >
      {$syncing ? '🔄 Syncing...' : '🔄 Sync Emails'}
    </button>
  </header>

  <main class="p-6">
    {#if $loading}
      <div class="flex justify-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    {:else if $error}
      <div class="max-w-2xl mx-auto bg-red-50 border border-red-200 p-4 rounded-lg text-red-700">
        ❌ {$error}
      </div>
    {:else if taskList.length === 0}
      <div class="text-center py-12 text-gray-500">
        <p class="text-lg mb-2">No tasks yet</p>
        <p class="text-sm">Click "Sync Emails" to import from Outlook</p>
      </div>
    {:else}
      <div class="flex gap-4 overflow-x-auto pb-4">
        {#each ['To Do', 'In Progress', 'Review', 'Done', 'On Hold', 'Cancelled'] as status}
          <div class="w-72 min-w-[18rem] bg-gray-100 rounded-xl p-4">
            <h3 class="font-bold text-gray-700 mb-3 border-b pb-2">
              {status} ({taskList.filter((t: Task) => t.status === status).length})
            </h3>
            <div class="space-y-2">
              {#each taskList.filter((t: Task) => t.status === status) as task}
                <div class="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                  <h4 class="font-medium text-gray-800 text-sm truncate">{task.title}</h4>
                  <p class="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
                  <div class="flex gap-2 mt-2 text-xs">
                    {#if task.quote}
                      <span class="text-green-600 font-medium">💰 {task.quote}</span>
                    {/if}
                    {#if task.date}
                      <span class="text-blue-600 font-medium">📅 {task.date}</span>
                    {/if}
                  </div>
                  <div class="text-xs text-gray-400 mt-2 truncate">
                    📩 {task.sender_name || task.sender_email || 'Unknown'}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </main>
</div>