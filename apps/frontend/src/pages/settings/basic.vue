<script setup lang="ts">
import AppButton from '../../components/base/AppButton.vue'
import { useDeviceBasicInfo } from '../../composables/use-device-basic-info'

const {
  deviceName,
  isBusy: isBasicInfoBusy,
  loadStatus: basicInfoLoadStatus,
  maxDeviceNameLength,
  saveBasicInfo,
  saveStatus: basicInfoSaveStatus,
  statusMessage: basicInfoStatusMessage,
  loadBasicInfo
} = useDeviceBasicInfo()
</script>

<template>
  <PanelCard title="Basic Info" description="Manage local device profile used by connected peers.">
    <label class="block">
      <span class="mb-1 block font-semibold text-muted-1">Device Name</span>
      <input
        v-model="deviceName"
        class="app-focus-ring w-full rounded-lg border border-white/14 bg-white/6 px-3 py-2 text-slate-100 placeholder:text-muted-4"
        type="text"
        :maxlength="maxDeviceNameLength"
        placeholder="Enter device name"
      />
    </label>

    <p class="text-sm text-muted-3">
      This name is persisted as basic device info and shared with connected devices after saving.
    </p>

    <div class="flex flex-wrap gap-2">
      <AppButton variant="solid" :disabled="isBasicInfoBusy" @click="saveBasicInfo">
        Save
      </AppButton>
      <AppButton :disabled="isBasicInfoBusy" @click="loadBasicInfo"> Reload </AppButton>
    </div>

    <p v-if="basicInfoLoadStatus === 'loading'" class="text-sm text-muted-3">
      Loading basic info...
    </p>
    <p
      v-if="basicInfoStatusMessage"
      class="text-sm"
      :class="basicInfoSaveStatus === 'error' ? 'text-error-4' : 'text-success-4'"
    >
      {{ basicInfoStatusMessage }}
    </p>
  </PanelCard>
</template>
