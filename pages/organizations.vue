<script setup lang="ts">
// Legacy route: organization management now lives at /orgs/[slug]/*, and the
// org list moved into the dashboard sidebar. Redirect there.
definePageMeta({ layout: "default" });
const { organizations } = useOrgs();
onMounted(() => {
  navigateTo(
    organizations.value[0]?.slug ? `/orgs/${organizations.value[0].slug}` : "/",
    {
      replace: true,
    },
  );
});
</script>

<template>
  <div class="py-16 text-center text-sm text-muted-foreground">
    <Icon spec="LoaderCircle" :size="20" class="mx-auto mb-2 animate-spin" />
  </div>
</template>
