'use client'

import React, { useState } from 'react';

interface Business {
  name: string;
  rating: number;
  address: string;
  phone: string;
  website: string;
}

const Scrape: React.FC = () => {
  const [city, setCity] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [limit, setLimit] = useState('10');
  const [minRating, setMinRating] = useState('0');
  const [timeLimit, setTimeLimit] = useState('5');
  const [results, setResults] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/scrape?city=${encodeURIComponent(city)}&businessType=${encodeURIComponent(businessType)}&limit=${limit}&minRating=${minRating}&timeLimit=${timeLimit}`);
      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 p-6">
      <h1 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Business Scraper</h1>

      <div className="mb-4 w-full max-w-md">
        <input
          type="text"
          placeholder="City"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
        />
      </div>

      <div className="mb-4 w-full max-w-md">
        <input
          type="text"
          placeholder="Business Type"
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
        />
      </div>

      <div className="mb-4 w-full max-w-md">
        <input
          type="number"
          placeholder="Limit"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
        />
      </div>

      <div className="mb-4 w-full max-w-md">
        <input
          type="number"
          step="0.1"
          placeholder="Minimum Rating"
          value={minRating}
          onChange={(e) => setMinRating(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
        />
      </div>

      <div className="mb-4 w-full max-w-md">
        <input
          type="number"
          placeholder="Time Limit (minutes)"
          value={timeLimit}
          onChange={(e) => setTimeLimit(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-700 dark:text-white dark:focus:ring-blue-400"
        />
      </div>

      <button
        onClick={handleSearch}
        disabled={loading}
        className={`w-full max-w-md p-3 text-white font-semibold rounded-md shadow-md transition duration-200 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
          }`}
      >
        {loading ? 'Scraping...' : 'Search'}
      </button>

      {error && (
        <div className="mt-4 text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <ul className="mt-6 w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-md divide-y divide-gray-200 dark:divide-gray-700">
          {results.map((business, index) => (
            <li key={index} className="p-4 hover:bg-gray-100 dark:hover:bg-gray-700">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">{business.name}</h2>
              <p className="text-gray-600 dark:text-gray-300">Rating: {business.rating}</p>
              <p className="text-gray-600 dark:text-gray-300">
                Website: {business.website ? (
                  <a href={business.website} className="text-blue-500 hover:underline">{business.website}</a>
                ) : 'N/A'}
              </p>
              <p className="text-gray-600 dark:text-gray-300">Phone: {business.phone || 'N/A'}</p>
              <p className="text-gray-600 dark:text-gray-300">Address: {business.address || 'N/A'}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Scrape;