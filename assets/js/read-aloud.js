(() => {
  const content = document.querySelector("article .content");

  if (!content) {
    return;
  }

  const controls = document.createElement("div");
  // controls.className =
  //   "d-flex flex-wrap align-items-center gap-2 mb-4 mt-2 post-audio-listen";

  controls.className =
    "post-audio-controls d-flex flex-wrap align-items-center gap-2 mb-4 mt-2";

  const listenButton = document.createElement("button");
  listenButton.type = "button";
  // listenButton.className = "btn btn-outline-primary btn-sm";
  listenButton.className =
    "btn btn-outline-primary btn-sm post-audio-listen ml-2";
  listenButton.textContent = "Listen to this post";

  const stopButton = document.createElement("button");
  stopButton.type = "button";
  // stopButton.className = "btn btn-outline-secondary btn-sm post-audio-stop";
  stopButton.className = "btn btn-outline-secondary btn-sm post-audio-stop";
  stopButton.textContent = "Stop";
  stopButton.hidden = true;

  const status = document.createElement("span");
  status.className = "small text-muted";
  status.setAttribute("aria-live", "polite");

  controls.append(listenButton, stopButton, status);
  content.before(controls);

  if (
    !("speechSynthesis" in window) ||
    !("SpeechSynthesisUtterance" in window)
  ) {
    listenButton.disabled = true;
    status.textContent = "Read-aloud is not supported by this browser.";
    return;
  }

  const speech = window.speechSynthesis;
  let activeUtterance = null;

  function reset(statusText = "") {
    activeUtterance = null;
    listenButton.textContent = "Listen to this post";
    stopButton.hidden = true;
    status.textContent = statusText;
  }

  function stop() {
    speech.cancel();
    reset();
  }

  function start() {
    const text = content.innerText.trim();

    if (!text) {
      status.textContent = "There is no post text to read.";
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = document.documentElement.lang || "en";
    utterance.onend = () => {
      if (activeUtterance === utterance) {
        reset("Finished reading.");
      }
    };
    utterance.onerror = (event) => {
      if (activeUtterance === utterance) {
        reset(
          event.error === "canceled" ? "" : "Read-aloud could not be played.",
        );
      }
    };

    activeUtterance = utterance;
    listenButton.textContent = "Pause reading";
    stopButton.hidden = false;
    status.textContent = "";
    speech.speak(utterance);
  }

  listenButton.addEventListener("click", () => {
    if (activeUtterance && speech.paused) {
      speech.resume();
      listenButton.textContent = "Pause reading";
      status.textContent = "Reading resumed.";
    } else if (activeUtterance && speech.speaking) {
      speech.pause();
      listenButton.textContent = "Resume reading";
      status.textContent = "Reading paused.";
    } else {
      start();
    }
  });

  stopButton.addEventListener("click", stop);
  window.addEventListener("pagehide", stop, { once: true });
})();
