<script setup lang="ts">
// Org campaign page (repo-style): /orgs/[slug]/campaigns/[id].
definePageMeta({ layout: "default" });
const route = useRoute();
const slug = route.params.slug as string;
const campaignId = Number(route.params.campaignId);
useHead({ title: () => `#${campaignId} · ${slug}` });
</script>

<template>
  <CampaignDetail :campaign-id="campaignId" :org-slug="slug" />
</template>
