document.addEventListener("DOMContentLoaded", () => {
  const tabs = document.querySelectorAll(".tabs button");
  const contents = document.querySelectorAll(".tab-content");

  tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      tabs.forEach(b => b.classList.remove("active"));
      contents.forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  // Placeholder: Initialize quest, journey, character, etc.
  document.getElementById("quest").innerHTML = "<h2>Quests</h2><p>Daily quests will appear here.</p>";
  document.getElementById("journey").innerHTML = "<h2>Journey</h2><p>Track progress, titles, achievements.</p>";
  document.getElementById("character").innerHTML = "<h2>Character</h2><p>Attributes and radar chart here.</p>";
  document.getElementById("store").innerHTML = "<h2>Store</h2><p>Buy rewards with gold.</p>";
  document.getElementById("focus").innerHTML = "<h2>Focus</h2><p>Simple timer tab.</p>";
});
