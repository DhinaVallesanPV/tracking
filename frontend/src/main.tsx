import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import UploadPage from './pages/UploadPage'
import RoiSelectionPage from './pages/RoiSelectionPage'
import ProcessingPage from './pages/ProcessingPage'
import ResultsPage from './pages/ResultsPage'
import './index.css'

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      children: [
        { index: true, element: <UploadPage /> },
        { path: 'roi-select/:jobId', element: <RoiSelectionPage /> },
        { path: 'processing/:jobId', element: <ProcessingPage /> },
        { path: 'results/:jobId', element: <ResultsPage /> },
      ],
    },
  ]
)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
