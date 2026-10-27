import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { Anomalies } from './pages/Anomalies';
import { Fixes } from './pages/Fixes';
import { Issues } from './pages/Issues';
import { Relationships } from './pages/Relationships';
import { Scans } from './pages/Scans';
import { StackMap } from './pages/StackMap';
import { ToolPage } from './pages/ToolPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<StackMap />} />
          <Route path="relationships" element={<Relationships />} />
          <Route path="tools/:toolId" element={<ToolPage />} />
          <Route path="issues" element={<Issues />} />
          <Route path="anomalies" element={<Anomalies />} />
          <Route path="fixes" element={<Fixes />} />
          <Route path="scans" element={<Scans />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
