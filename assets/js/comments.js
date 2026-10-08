(() => {
  const comments = document.getElementById("post-comments");

  if (!comments) {
    return;
  }

  const footer = document.querySelector("footer");
  if (footer) {
    footer.before(comments);
  }

  const repo = comments.dataset.utterancesRepo;
  const githubComments = comments.querySelector("#github-comments");

  if (repo && githubComments) {
    const script = document.createElement("script");
    script.src = "https://utteranc.es/client.js";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.setAttribute("repo", repo);
    script.setAttribute("issue-term", comments.dataset.utterancesIssueTerm || "pathname");
    script.setAttribute("theme", "github-light");
    githubComments.append(script);
  }

  const shortname = comments.dataset.disqusShortname;
  const guestComments = comments.querySelector("#guest-comments");

  if (!shortname || !guestComments) {
    return;
  }

  const thread = document.createElement("div");
  thread.id = "disqus_thread";
  guestComments.replaceChildren(thread);

  window.disqus_config = function configureDisqus() {
    this.page.url = window.location.href.split("#")[0];
    this.page.identifier = window.location.pathname;
  };

  const script = document.createElement("script");
  script.src = `https://${encodeURIComponent(shortname)}.disqus.com/embed.js`;
  script.async = true;
  script.setAttribute("data-timestamp", String(Date.now()));
  document.head.append(script);
})();
