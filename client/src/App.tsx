import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { api, Me } from './api';
import Login from './screens/Login';
import Home from './screens/Home';
import Count from './screens/Count';
import List from './screens/List';
import Family from './screens/Family';
import Catalog from './screens/Catalog';
import ItemEdit from './screens/ItemEdit';
import Scan from './screens/Scan';
import People from './screens/People';
import ChangePin from './screens/ChangePin';

function ReviewerRoutes() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useEffect(() => {
    api<Me | { name: null }>('/api/me').then((r) => setMe(r.name ? (r as Me) : null)).catch(() => setMe(null));
  }, []);
  if (me === undefined) return <div className="screen" />;
  if (!me) return <Login onSignedIn={setMe} />;
  return (
    <Routes>
      <Route path="/" element={<Home me={me} onSignOut={() => setMe(null)} />} />
      <Route path="/count" element={<Count />} />
      <Route path="/list" element={<List role={me.role} />} />
      <Route path="/catalog" element={<Catalog />} />
      <Route path="/catalog/new" element={<ItemEdit />} />
      <Route path="/catalog/:id" element={<ItemEdit />} />
      <Route path="/scan" element={<Scan />} />
      <Route path="/pin" element={<ChangePin />} />
      <Route path="/people" element={me.role === 'admin' ? <People owner={me.owner} /> : <Navigate to="/" replace />} />
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
