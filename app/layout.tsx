export const metadata = {
  title: "Temperature Direction AI",
  description: "Search a city and see where its temperature is heading"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#ffffff", color: "#1a1f26" }}>
        {children}
      </body>
    </html>
  );
}
