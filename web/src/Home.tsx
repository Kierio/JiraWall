export function Home() {
  return (
    <main className="home">
      <h1>📊 Jira Wall Dashboard</h1>
      <p className="muted">Open each screen in its own kiosk window, and use the admin page to configure them.</p>
      <nav className="home-links">
        <a href="/screen/1">Screen 1</a>
        <a href="/screen/2">Screen 2</a>
        <a href="/admin">Admin</a>
      </nav>
    </main>
  );
}
