import {
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Container,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import MetaTags from 'components/Common/MetaTags';
import Footer from 'components/Home/Footer';
import { CustomLogo } from 'components/Logo/CustomLogo';

const Login = () => {
  return (
    <Box>
      <MetaTags title="Login" />
      <Container>
        <Stack alignItems={'center'} mt={8}>
          <CustomLogo style={{ width: 50, height: 50 }}>C</CustomLogo>
          <Typography variant="h5" fontWeight={'bold'} mt={4}>
            Welcome to your CryptoPay Server
          </Typography>

          <Card sx={{ minWidth: 450, mt: 4, padding: 2 }}>
            <CardContent>
              <Typography variant="h5">Sign in</Typography>
              <Box mt={3}>
                <Typography>Email</Typography>
                <Box mt={1}>
                  <TextField fullWidth hiddenLabel id="filled-hidden-label-small" defaultValue="" size="small" />
                </Box>
              </Box>
              <Box mt={3}>
                <Stack direction={'row'} justifyContent={'space-between'} alignItems={'center'}>
                  <Typography>Password</Typography>
                  <Button>Forgot password?</Button>
                </Stack>
                <Box mt={1}>
                  <TextField
                    fullWidth
                    hiddenLabel
                    type={'password'}
                    id="filled-hidden-label-small"
                    defaultValue=""
                    size="small"
                  />
                </Box>
              </Box>
              <Box mt={3}>
                <FormControlLabel control={<Checkbox />} label="Remember me" />
              </Box>

              <Box mt={3}>
                <Button fullWidth variant={'contained'} size={'large'}>
                  Sign in
                </Button>
              </Box>

              <Box mt={3} textAlign={'center'}>
                <Button
                  onClick={() => {
                    window.location.href = '/register';
                  }}
                >
                  Create your account
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Stack>

        <Footer />
      </Container>
    </Box>
  );
};

export default Login;
