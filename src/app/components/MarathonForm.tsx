'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import TrainingPlan from './TrainingPlan';

export default function MarathonForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    raceDate: '',
    goalTime: {
      hours: '',
      minutes: '',
      seconds: ''
    },
    currentMileage: ''
  });
  const [trainingPlan, setTrainingPlan] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState<string | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const generateWeek = async (weekNumber: number = 1) => {
    setIsLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          requestId,
          weekNumber
        }),
      });
      
      if (!response.ok) throw new Error('Failed to generate plan');
      
      const data = await response.json();
      
      // Save the requestId for subsequent requests
      if (data.requestId) {
        setRequestId(data.requestId);
      }

      // Add the new week's plan
      if (weekNumber === 1) {
        setTrainingPlan(data.plan);
      } else {
        setTrainingPlan(prev => prev + '\n\n' + data.plan);
      }
      
      setHasMore(data.hasMore);
      setCurrentWeek(data.nextWeek);
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to generate plan. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrainingPlan('');
    setRequestId(null);
    setCurrentWeek(1);
    setHasMore(false);
    generateWeek(1);
  };

  const handleLoadMore = () => {
    if (hasMore) {
      generateWeek(currentWeek);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-6 p-6">
        <div className="space-y-2">
          <label htmlFor="raceDate" className="block text-sm font-medium text-white">
            When is your race?
          </label>
          <input
            type="date"
            id="raceDate"
            value={formData.raceDate}
            onChange={(e) => setFormData({ ...formData, raceDate: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-white">
            What is your goal finish time?
          </label>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <input
                type="number"
                placeholder="Hours"
                min="0"
                max="23"
                value={formData.goalTime.hours}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, hours: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
                required
              />
            </div>
            <div>
              <input
                type="number"
                placeholder="Minutes"
                min="0"
                max="59"
                value={formData.goalTime.minutes}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, minutes: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
                required
              />
            </div>
            <div>
              <input
                type="number"
                placeholder="Seconds"
                min="0"
                max="59"
                value={formData.goalTime.seconds}
                onChange={(e) => setFormData({
                  ...formData,
                  goalTime: { ...formData.goalTime, seconds: e.target.value }
                })}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
                required
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="currentMileage" className="block text-sm font-medium text-white">
            How many miles per week are you currently running?
          </label>
          <input
            type="number"
            id="currentMileage"
            min="0"
            step="0.1"
            value={formData.currentMileage}
            onChange={(e) => setFormData({ ...formData, currentMileage: e.target.value })}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-black"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className={`w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? `Generating Week ${currentWeek}...` : 'Generate Training Plan'}
        </button>

        {error && (
          <p className="text-red-500 text-sm text-center mt-2">{error}</p>
        )}
      </form>

      {trainingPlan && (
        <div className="space-y-4">
          <TrainingPlan plan={trainingPlan} />
          {hasMore && (
            <div className="flex justify-center mt-4">
              <button
                onClick={handleLoadMore}
                disabled={isLoading}
                className={`bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {isLoading ? `Generating Week ${currentWeek}...` : 'Load Next Week'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
} 