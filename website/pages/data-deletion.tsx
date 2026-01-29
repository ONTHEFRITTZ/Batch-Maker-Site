export default function DataDeletion() {
  return (
    <main style={styles.container}>
      <h1>Data Deletion Request</h1>

      <p>
        To request deletion of your Batch Maker account and all associated data, 
        please email us at:
      </p>

      <p>
        <strong>
          <a href="mailto:batch.maker.app@gmail.com?subject=Data Deletion Request">
            batch.maker.app@gmail.com
          </a>
        </strong>
      </p>

      <p>
        Please include the following information in your request:
      </p>

      <ul>
        <li>The email address associated with your account</li>
        <li>Your device name (if known)</li>
        <li>Subject line: "Data Deletion Request"</li>
      </ul>

      <h2>What Will Be Deleted</h2>
      <p>
        Upon receiving your request, we will permanently delete:
      </p>
      <ul>
        <li>Your account profile and credentials</li>
        <li>All workflows you created</li>
        <li>All batch tracking data</li>
        <li>All reports and photos</li>
        <li>All subscription information</li>
      </ul>

      <p>
        <strong>Timeline:</strong> We will process your deletion request within 30 days.
      </p>

      <p>
        <strong>Note:</strong> This action cannot be undone. All your data will be 
        permanently deleted from our servers.
      </p>

      <hr style={styles.hr} />

      <nav style={styles.nav}>
        <a href="/">Home</a>
        <a href="/privacy-policy">Privacy Policy</a>
        <a href="/support">Support</a>
      </nav>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 720,
    margin: "0 auto",
    padding: "48px 24px",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    lineHeight: 1.6
  },
  hr: { margin: "3rem 0" },
  nav: { display: "flex", gap: "1rem", flexWrap: "wrap" }
};