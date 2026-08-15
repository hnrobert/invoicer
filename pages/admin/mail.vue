<script setup lang="ts">
// Superadmin site settings → Mail: SMTP / POST webhook delivery config.
definePageMeta({ layout: "default", middleware: "superadmin" });
const { t } = useI18n();
useHead({ title: () => t("admin.title") });
</script>

<template>
  <SettingsShell
    :title="t('admin.title')"
    active="mail"
    :sections="[
      { key: 'mail', label: t('admin.sections.mail'), to: '/admin/mail' },
      { key: 'users', label: t('admin.sections.users'), to: '/admin/users' },
    ]"
  >
    <MailSettings />
  </SettingsShell>
</template>
