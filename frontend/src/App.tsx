import { BrowserRouter, Route, Routes } from "react-router";
import Home from "./Home";
import Upload from "./Upload";
import Room from "./Room";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/room/:deckId" element={<Room />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
