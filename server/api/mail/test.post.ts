import { renderCardEmail } from "email-poster/template";
import { siteTheme } from "#server/mail/theme";
import { sendMail } from "#server/utils/mail";

/** Send a test email using the configured site SMTP settings. */
export default defineEventHandler(async (event) => {
  const { to } = await readBody<{ to?: string }>(event);
  if (!to)
    throw createError({ statusCode: 400, statusMessage: "请填写收件人邮箱" });

  const html = renderCardEmail(
    {
      title: "测试邮件",
      bodyHtml:
        "<p>这是一封来自发票审核系统的测试邮件，收到即代表 SMTP 配置正常。</p>",
      preheader: "发票审核系统测试邮件",
    },
    siteTheme(),
  );
  const messageId = await sendMail({
    to,
    subject: "发票审核系统 · 测试邮件",
    body: html,
    html: true,
  });
  return { ok: true, messageId };
});
