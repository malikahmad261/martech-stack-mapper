import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { Overview } from './pages/Overview';
import { LegacyRedirect, Problems } from './pages/Problems';
import { Relationships } from './pages/Relationships';
import { Scans } from './pages/Scans';
import { StackMap } from './pages/StackMap';
import { ToolPage } from './pages/ToolPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="problems" element={<Problems />} />
          <Route path="problems/:id" element={<Problems />} />
          <Route path="map" element={<StackMap />} />
          <Route path="relationships" element={<Relationships />} />
          <Route path="tools/:toolId" element={<ToolPage />} />
          <Route path="scans" element={<Scans />} />
          <Route path="issues" element={<LegacyRedirect kind="issues" />} />
          <Route path="anomalies" element={<LegacyRedirect kind="anomalies" />} />
          <Route path="fixes" element={<LegacyRedirect kind="fixes" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
