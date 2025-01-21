'use client';

import ReactMarkdown from 'react-markdown';

interface TrainingPlanProps {
  plan: string;
}

export default function TrainingPlan({ plan }: TrainingPlanProps) {
  return (
    <div className="max-w-4xl mx-auto mt-8 p-8 bg-white rounded-lg shadow-lg">
      <h2 className="text-3xl font-bold mb-8 text-black text-center">Your Marathon Training Plan</h2>
      <div className="prose prose-lg max-w-none text-black">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold mt-8 mb-6 text-black bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-500">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-bold mt-8 mb-4 text-black bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500">
                {children}
              </h2>
            ),
            blockquote: ({ children }) => (
              <div className="mt-2 mb-4 pl-4 py-2 border-l-4 border-green-500 bg-green-50 rounded-r-lg">
                {children}
              </div>
            ),
            strong: ({ children }) => {
              const text = children?.toString() || '';
              // If it's a date (contains a comma), use a different style
              if (text.includes(',')) {
                return (
                  <strong className="block text-lg font-semibold mt-8 mb-3 text-black bg-blue-50 p-3 rounded-lg border-l-4 border-blue-500">
                    {children}
                  </strong>
                );
              }
              return <strong className="font-semibold text-black">{children}</strong>;
            },
            p: ({ children }) => {
              const text = children?.toString() || '';
              if (text.startsWith('Run:')) {
                return <p className="mb-1 text-black font-medium pl-4">{children}</p>;
              }
              if (text.startsWith('Pace:')) {
                return <p className="mb-1 text-black text-sm pl-4">{children}</p>;
              }
              if (text.startsWith('Notes:')) {
                return <p className="mb-6 text-gray-600 text-sm italic pl-4">{children}</p>;
              }
              return <p className="mb-4 text-black">{children}</p>;
            },
            ul: ({ children }) => (
              <ul className="list-disc pl-6 mb-4 space-y-2 text-black">
                {children}
              </ul>
            ),
            li: ({ children }) => (
              <li className="text-black leading-relaxed">{children}</li>
            ),
          }}
        >
          {plan}
        </ReactMarkdown>
      </div>
    </div>
  );
} 