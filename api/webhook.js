async function sendBotFile(login, fileUrl, filename) {
  const fileResponse = await fetch(fileUrl);

  if (!fileResponse.ok) {
    console.log("FILE DOWNLOAD ERROR:", fileResponse.status);
    return {
      ok: false,
      status: fileResponse.status
    };
  }

  const buffer = await fileResponse.arrayBuffer();

  const formData = new FormData();
  formData.append("login", login);
  formData.append(
    "file",
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }),
    filename
  );

  const response = await fetch(
    "https://botapi.messenger.yandex.net/bot/v1/messages/sendFile/",
    {
      method: "POST",
      headers: {
        "Authorization": `OAuth ${process.env.BOT_TOKEN}`
      },
      body: formData
    }
  );

  const resultText = await response.text();
  console.log("SEND FILE RESULT:", response.status, resultText);

  return {
    ok: response.ok,
    status: response.status,
    raw: resultText
  };
}
