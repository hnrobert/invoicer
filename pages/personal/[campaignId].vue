<script setup lang="ts">
// Personal campaign page (repo-style): /personal/[id] — no org breadcrumb.
definePageMeta({ layout: "default" });
const route = useRoute();
const campaignId = Number(route.params.campaignId);
useHead({ title: () => `#${campaignId}` });
</script>

<template>
  <CampaignDetail :campaign-id="campaignId" :org-slug="null" />
</template>
