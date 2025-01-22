import MarathonForm from './components/MarathonForm';

// Version 1.1.4 - Fix linting errors and escape apostrophes
export default function Home() {
  return (
    <main className="min-h-screen bg-[#004225] p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-white">Marathon Training Plan Generator</h1>
        <MarathonForm />
      </div>
    </main>
  );
}
