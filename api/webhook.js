export default async function handler(req, res) {
  const data = req.body;

  console.log("ПРИШЛО:", JSON.stringify(data));

  try {
    const update = data?.updates?.[0];

    const text =
      update?.message?.text ||
      update?.text ||
      "";

    if (!text) {
      console.log("Текст сообщения не найден");
      return res.status(200).end();
    }

    const trackerResponse = await fetch("https://api.tracker.yandex.net/v3/issues/", {
      method: "POST",
      headers: {
        "Authorization": `OAuth ${process.env.YANDEX_TOKEN}`,
        "X-Org-ID": process.env.ORG_ID,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        summary: text,
        queue: "DANILVITT",
        assignee: "danil",
        tags: ["from_bot_personal"]
      })
    });

    const trackerResult = await trackerResponse.text();
    console.log("ОТВЕТ TRACKER:", trackerResponse.status, trackerResult);

  } catch (error) {
    console.log("ОШИБКА:", error?.message || error);
  }

  return res.status(200).end();
}
