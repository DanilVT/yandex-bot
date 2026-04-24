const userStates = new Map();

const USERS = {
  "danil@panelgroup.ru": {
    queue: "DANILVITT",
    assignee: "danil",
    tag: "from_bot_personal",
    bitrixAssignedById: 22
  },
  "timothy@panelgroup.ru": {
    queue: "TIMOFEICHETIN",
    assignee: "timothy",
    tag: "from_bot_personal",
    bitrixAssignedById: 1897
  },
  "daria@panelgroup.ru": {
    queue: "DARIAISAEVA",
    assignee: "daria",
    tag: "from_bot_personal",
    bitrixAssignedById: 3482
  }
};

const YA_DISK_DOWNLOAD = "https://cloud-api.yandex.net/v1/disk/resources/download?path=";

async function sendBotMessage(login, text, menu = "main") {
  const body = { login, text };

  if (menu === "main") {
    body.suggest_buttons = {
      layout: "true",
      persist: true,
      buttons: [
        [{ title: "Трекер: личная задача", directives: [{ type: "server_action", name: "create_personal_task" }] }],
        [{ title: "Трекер: замер / монтаж", directives: [{ type: "server_action", name: "create_montazh_task" }] }],
        [{ title: "CRM: новый лид", directives: [{ type: "server_action", name: "create_bitrix_lead" }] }]
      ]
    };
  }

  if (menu === "montazh_files") {
    body.suggest_buttons = {
      layout: "true",
      persist: false,
      buttons: [
        [{ title: "Пропустить", directives: [{ type: "server_action", name: "skip_montazh_files" }] }]
      ]
    };
  }

  await fetch("https://botapi.messenger.yandex.net/bot/v1/messages/sendText/", {
    method: "POST",
    headers: {
      Authorization: `OAuth ${process.env.BOT_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function downloadFileFromYandex(fileId) {
  const urlRes = await fetch(`${YA_DISK_DOWNLOAD}${encodeURIComponent(fileId)}`, {
    headers: { Authorization: `OAuth ${process.env.BOT_TOKEN}` }
  });

  const urlData = await urlRes.json();
  const fileRes = await fetch(urlData.href);
  return await fileRes.arrayBuffer();
}

async function uploadToTracker(issueKey, fileBuffer, filename) {
  const res = await fetch(
    `https://api.tracker.yandex.net/v3/issues/${issueKey}/attachments`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${process.env.OAUTH_TOKEN}`,
        "X-Org-ID": process.env.ORG_ID
      },
      body: fileBuffer
    }
  );

  return res.ok;
}

async function createMontazhIssue(address, volume) {
  const response = await fetch("https://api.tracker.yandex.net/v3/issues/", {
    method: "POST",
    headers: {
      Authorization: `OAuth ${process.env.OAUTH_TOKEN}`,
      "X-Org-ID": process.env.ORG_ID,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      summary: `Замер / монтаж — ${address}`,
      description: `Адрес: ${address}\n\nОбъём:\n${volume}`,
      queue: "MONTAZH",
      assignee: "danil",
      tags: ["montazh_from_bot"]
    })
  });

  const data = await response.json();
  return { ok: response.ok, issueKey: data.key };
}

export default async function handler(req, res) {
  try {
    const update = req.body?.updates?.[0];
    if (!update) return res.status(200).end();

    const login = update?.from?.login;
    const text = (update?.text || "").trim();
    const action = update?.bot_request?.server_action?.name;

    const state = userStates.get(login);

    // === старт ===

    if (action === "create_montazh_task") {
      userStates.set(login, { step: "address" });
      await sendBotMessage(login, "Введи адрес");
      return res.status(200).end();
    }

    if (state?.step === "address") {
      userStates.set(login, { step: "volume", address: text });
      await sendBotMessage(login, "Введи объём");
      return res.status(200).end();
    }

    if (state?.step === "volume") {
      userStates.set(login, {
        step: "files",
        address: state.address,
        volume: text,
        files: []
      });

      await sendBotMessage(login, "Прикрепи файлы или пропусти", "montazh_files");
      return res.status(200).end();
    }

    // === ЛОВИМ ФАЙЛЫ ===

    if (state?.step === "files") {
      let files = state.files || [];

      // PDF / DOC
      if (update.file) {
        files.push(update.file);
      }

      // Картинки
      if (update.images) {
        const original = update.images[0].slice(-1)[0];
        files.push({
          id: original.file_id,
          name: "image.jpg"
        });
      }

      userStates.set(login, { ...state, files });

      // создаём задачу
      userStates.delete(login);

      const issue = await createMontazhIssue(state.address, state.volume);

      if (issue.ok && files.length > 0) {
        for (const file of files) {
          try {
            const buffer = await downloadFileFromYandex(file.id);
            await uploadToTracker(issue.issueKey, buffer, file.name);
          } catch (e) {
            console.log("FILE ERROR:", e);
          }
        }
      }

      await sendBotMessage(login, "Задача создана с файлами", "main");
      return res.status(200).end();
    }

    if (action === "skip_montazh_files") {
      if (!state) return res.status(200).end();

      userStates.delete(login);

      await createMontazhIssue(state.address, state.volume);
      await sendBotMessage(login, "Задача создана без файлов", "main");

      return res.status(200).end();
    }

    await sendBotMessage(login, "Нажми кнопку", "main");

    return res.status(200).end();
  } catch (e) {
    console.log("ERROR:", e);
    return res.status(200).end();
  }
}
