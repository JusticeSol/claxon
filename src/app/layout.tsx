export const metadata = { title: "Claxon", description: "Claxon — alerts for FXRP agent health on Flare" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}
