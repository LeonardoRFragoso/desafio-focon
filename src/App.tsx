import { AuthProvider } from '@/features/auth/AuthContextProvider';
import { AppRoutes } from '@/routes';

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;
