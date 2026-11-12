import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import Login from './screens/Login';
import Home from './screens/Home';
import Count from './screens/Count';
import List from './screens/List';
import Family from './screens/Family';
import Catalog from './screens/Catalog';
import ItemEdit from './screens/ItemEdit';
import Scan from './screens/Scan';

function ReviewerRoutes() {
  const [me, setMe] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    api<{ name: string | null }>('/api/me').then((r) => setMe(r.name)).catch(() => setMe(null));
  }, []);
  if (me === undefined) return <div className="screen" />;
  if (!me) return <Login onSignedIn={setMe} />;
  return (
    <Routes>
      <Route path="/" element={<Home name={me} onSignOut={() => setMe(null)} />} />
      <Route path="/count" element={<Count />} />
      <Route path="/list" element={<List />} />
      <Route path="/catalog" element={<Catalog />} />
      <Route path="/catalog/new" element={<ItemEdit />} />
      <Route path="/catalog/:id" element={<ItemEdit />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/f/:token" element={<Family />} />
        <Route path="/*" element={<ReviewerRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
