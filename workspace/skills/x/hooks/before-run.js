export default async function beforeRun(payload) {
  const action = String(payload?.action || "");
  const params = payload?.params && typeof payload.params === "object" ? payload.params : {};

  if ((action === "post" || action === "reply") && params.confirm !== true) {
    return {
      cancel: true,
      reason: "X write actions require `confirm: true` because they create external side effects.",
    };
  }

  return null;
}
