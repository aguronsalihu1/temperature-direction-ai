export const metadata = {
  title: "Temperature Direction AI",
  description: "Search a city and see where its temperature is heading"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#0b0f14", color: "#e8edf2" }}>
        {children}
      </body>
    </html>
  );
}
