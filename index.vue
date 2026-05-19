<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-900 py-12 px-4 sm:px-6 lg:px-8">
    <div class="max-w-md w-full space-y-8 bg-slate-800 p-10 rounded-2xl shadow-2xl border border-slate-700">
      <div>
        <div class="w-16 h-16 bg-emerald-500 text-white rounded-xl flex items-center justify-center font-bold text-2xl mx-auto shadow-lg rotate-3">
          SM
        </div>
        <h2 class="mt-6 text-center text-3xl font-extrabold text-white">
          Seller Management
        </h2>
        <p class="mt-2 text-center text-sm text-slate-400">
          Manage your MarketX store using AI commands
        </p>
      </div>
      <div class="mt-8 space-y-6">
        <NuxtLink
          to="/seller/chat"
          class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-slate-900 bg-emerald-500 hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-colors"
        >
          Open Store Assistant
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
