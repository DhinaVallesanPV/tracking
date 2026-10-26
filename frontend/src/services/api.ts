import axios from 'axios'

// Switch between LOCAL and COLAB backend here
// const BASE_URL = 'http://localhost:8000'
const BASE_URL = 'https://timothy-clothing-stick.ngrok-free.dev' 

const api = axios.create({ 
  baseURL: BASE_URL,
  headers: {
    'ngrok-skip-browser-warning': 'true'
  }
})

export default api
