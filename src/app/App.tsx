import { RouterProvider } from 'react-router-dom'
import { AppDataProvider } from '../contexts/AppDataContext'
import { ThemeProvider } from '../contexts/ThemeContext'
import { ToastProvider } from '../contexts/ToastContext'
import { router } from './router'

export default function App() {
  return (
    <AppDataProvider>
      <ThemeProvider>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </ThemeProvider>
    </AppDataProvider>
  )
}
