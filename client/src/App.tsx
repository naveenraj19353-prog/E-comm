import { store } from "./redux/store"

const App = () => {

  console.log(store.getState())
  return <div>
    App
  </div>
}

export default App