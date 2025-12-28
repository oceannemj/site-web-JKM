// register.js - Gestion complète de l'inscription (VERSION FINALE)
import { checkAuth } from './api.js';

const API_BASE = 'http://localhost:3000/api';

// État global
let isSubmitting = false;

// ============================================
// INITIALISATION
// ============================================

async function initRegister() {
  console.log('🚀 Initialisation de la page d\'inscription');
  
  try {
    // Vérifier si déjà connecté
    const auth = await checkAuth();
    if (auth.isAuth) {
      console.log('✅ Utilisateur déjà connecté:', auth.user.email);
      showAlreadyLoggedIn(auth.user);
      return;
    }

    // Initialiser les event listeners
    initEventListeners();
    
    // Pré-remplir l'email si vient de login
    prefillEmail();
    
    // Animation d'entrée
    animateEntrance();

    console.log('✅ Page d\'inscription initialisée');

  } catch (error) {
    console.error('❌ Erreur initialisation:', error);
  }
}

// ============================================
// AFFICHAGE SI DÉJÀ CONNECTÉ
// ============================================

function showAlreadyLoggedIn(user) {
  const container = document.querySelector('.card.card-gradient');
  container.innerHTML = `
    <div class="text-center py-5">
      <div class="mb-4">
        <i class="bi bi-check-circle-fill text-success" style="font-size: 5rem;"></i>
      </div>
      <h3 class="fw-bold mb-3">Déjà connecté !</h3>
      <p class="text-muted mb-4">
        Vous êtes connecté en tant que <strong>${user.email}</strong>
      </p>
      <div class="d-flex gap-2 justify-content-center flex-wrap">
        <a href="index.html" class="btn btn-gradient rounded-pill px-4">
          <i class="bi bi-house"></i> Accueil
        </a>
        <a href="profil.html" class="btn btn-outline-primary rounded-pill px-4">
          <i class="bi bi-person"></i> Mon Profil
        </a>
      </div>
    </div>
  `;

  updateAuthIcon('profil.html', 'person-check', 'Mon Profil');
}

// ============================================
// VALIDATION DU FORMULAIRE
// ============================================

class FormValidator {
  constructor() {
    this.errors = {};
  }

  validateNom(nom) {
    const trimmed = nom.trim();
    if (!trimmed) {
      this.errors.nom = 'Le nom est requis';
      return false;
    }
    if (trimmed.length < 2) {
      this.errors.nom = 'Le nom doit contenir au moins 2 caractères';
      return false;
    }
    if (!/^[a-zA-ZÀ-ÿ\s-]+$/.test(trimmed)) {
      this.errors.nom = 'Le nom ne peut contenir que des lettres';
      return false;
    }
    delete this.errors.nom;
    return true;
  }

  validatePrenom(prenom) {
    const trimmed = prenom.trim();
    if (!trimmed) {
      this.errors.prenom = 'Le prénom est requis';
      return false;
    }
    if (trimmed.length < 2) {
      this.errors.prenom = 'Le prénom doit contenir au moins 2 caractères';
      return false;
    }
    if (!/^[a-zA-ZÀ-ÿ\s-]+$/.test(trimmed)) {
      this.errors.prenom = 'Le prénom ne peut contenir que des lettres';
      return false;
    }
    delete this.errors.prenom;
    return true;
  }

  validateEmail(email) {
    const trimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!trimmed) {
      this.errors.email = 'L\'email est requis';
      return false;
    }
    if (!emailRegex.test(trimmed)) {
      this.errors.email = 'Email invalide';
      return false;
    }
    delete this.errors.email;
    return true;
  }

  validatePassword(password) {
    if (!password) {
      this.errors.password = 'Le mot de passe est requis';
      return false;
    }
    if (password.length < 8) {
      this.errors.password = 'Le mot de passe doit contenir au moins 8 caractères';
      return false;
    }
    
    delete this.errors.password;
    return true;
  }

  validateConfirmPassword(password, confirmPassword) {
    if (!confirmPassword) {
      this.errors.confirmPassword = 'Veuillez confirmer le mot de passe';
      return false;
    }
    if (password !== confirmPassword) {
      this.errors.confirmPassword = 'Les mots de passe ne correspondent pas';
      return false;
    }
    delete this.errors.confirmPassword;
    return true;
  }

  validateTerms(checked) {
    if (!checked) {
      this.errors.terms = 'Vous devez accepter les conditions d\'utilisation';
      return false;
    }
    delete this.errors.terms;
    return true;
  }

  isValid() {
    return Object.keys(this.errors).length === 0;
  }

  getErrors() {
    return this.errors;
  }
}

// ============================================
// GESTION DU MOT DE PASSE
// ============================================

function updatePasswordStrength(password) {
  const strengthBar = document.getElementById('password-strength');
  const strengthText = document.getElementById('strength-text');
  
  if (!strengthBar) return;

  const length = password.length;
  let percentage = 0;
  let className = 'password-strength strength-weak';
  let text = '';

  if (length === 0) {
    percentage = 0;
    text = '';
  } else if (length < 8) {
    percentage = (length / 8) * 100;
    className = 'password-strength strength-weak';
    text = `🔴 ${length}/8 caractères`;
  } else {
    percentage = 100;
    className = 'password-strength strength-strong';
    text = '🟢 Valide';
  }

  strengthBar.style.width = `${percentage}%`;
  strengthBar.className = className;
  if (strengthText) strengthText.textContent = text;
}

function togglePasswordVisibility(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'bi bi-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'bi bi-eye';
  }
}

// ============================================
// SOUMISSION DU FORMULAIRE
// ============================================

async function handleSubmit(event) {
  event.preventDefault();
  console.log('📝 Soumission du formulaire d\'inscription');

  if (isSubmitting) {
    console.log('⚠️ Inscription déjà en cours');
    return;
  }

  const validator = new FormValidator();

  // Récupérer les valeurs
  const prenom = document.getElementById('reg-prenom').value;
  const nom = document.getElementById('reg-nom').value;
  const email = document.getElementById('reg-email').value;
  const password = document.getElementById('reg-password').value;
  const confirmPassword = document.getElementById('reg-confirm-password').value;
  const terms = document.getElementById('terms').checked;

  console.log('📧 Email:', email);

  // Validation
  validator.validatePrenom(prenom);
  validator.validateNom(nom);
  validator.validateEmail(email);
  validator.validatePassword(password);
  validator.validateConfirmPassword(password, confirmPassword);
  validator.validateTerms(terms);

  // Afficher les erreurs
  if (!validator.isValid()) {
    console.log('❌ Erreurs de validation:', validator.getErrors());
    displayErrors(validator.getErrors());
    return;
  }

  // Clear erreurs
  clearErrors();

  // Afficher la confirmation
  const confirmResult = await showConfirmationModal(prenom, nom, email);
  if (!confirmResult) {
    console.log('🚫 Inscription annulée par l\'utilisateur');
    return;
  }

  // État de chargement
  isSubmitting = true;
  setLoadingState(true);

  try {
    const userData = {
      prenom: prenom.trim(),
      nom: nom.trim(),
      email: email.trim().toLowerCase(),
      password: password
    };

    console.log('📤 Envoi des données d\'inscription');
    console.log('🌐 URL:', `${API_BASE}/auth/register`);

    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(userData)
    });

    console.log('📊 Status HTTP:', response.status);

    const data = await response.json();
    console.log('📦 Réponse reçue:', data);

    if (!response.ok) {
      throw new Error(data.message || data.error || 'Erreur lors de l\'inscription');
    }

    if (data.success) {
      console.log('🎉 Inscription réussie !');
      
      // Sauvegarder le token
      if (data.token) {
        localStorage.setItem('jwtToken', data.token);
        console.log('🔑 Token JWT sauvegardé');
      }

      // Afficher le succès
      showSuccess(data, email);

      // Redirection vers le profil
      setTimeout(() => {
        console.log('🔄 Redirection vers profil.html');
        window.location.href = 'profil.html';
      }, 2500);
    } else {
      throw new Error(data.error || 'Erreur lors de l\'inscription');
    }

  } catch (error) {
    console.error('❌ Erreur inscription:', error);
    showError(error.message || 'Une erreur est survenue lors de l\'inscription');
  } finally {
    isSubmitting = false;
    setLoadingState(false);
  }
}

// ============================================
// MODAL DE CONFIRMATION
// ============================================

function showConfirmationModal(prenom, nom, email) {
  return new Promise((resolve) => {
    const modalHTML = `
      <div class="modal fade" id="confirmRegisterModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content">
            <div class="modal-header border-0">
              <h5 class="modal-title fw-bold gradient-text">
                <i class="bi bi-person-check"></i> Confirmer l'inscription
              </h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fermer"></button>
            </div>
            <div class="modal-body">
              <div class="alert alert-info border-0 mb-3" style="background: linear-gradient(135deg, var(--blue-100) 0%, var(--purple-100) 100%);">
                <i class="bi bi-info-circle"></i>
                <strong>Veuillez vérifier vos informations</strong>
              </div>
              
              <div class="card border-0 bg-light p-3">
                <div class="mb-2">
                  <i class="bi bi-person text-primary"></i>
                  <strong>Nom complet:</strong> ${prenom} ${nom}
                </div>
                <div>
                  <i class="bi bi-envelope text-primary"></i>
                  <strong>Email:</strong> ${email}
                </div>
              </div>

              <p class="small text-muted mt-3 mb-0">
                <i class="bi bi-shield-check text-success"></i>
                Vos données sont sécurisées et protégées selon notre politique de confidentialité.
              </p>
            </div>
            <div class="modal-footer border-0">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" id="cancel-register">
                <i class="bi bi-x-circle"></i> Annuler
              </button>
              <button type="button" class="btn btn-gradient" id="confirm-register">
                <i class="bi bi-check-circle"></i> Confirmer l'inscription
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    const oldModal = document.getElementById('confirmRegisterModal');
    if (oldModal) oldModal.remove();

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modalElement = document.getElementById('confirmRegisterModal');
    const modal = new bootstrap.Modal(modalElement);

    document.getElementById('confirm-register').addEventListener('click', () => {
      modal.hide();
      resolve(true);
    });

    document.getElementById('cancel-register').addEventListener('click', () => {
      modal.hide();
      resolve(false);
    });

    modalElement.addEventListener('hidden.bs.modal', () => {
      modalElement.remove();
    });

    modal.show();
  });
}

// ============================================
// GESTION DE L'INTERFACE
// ============================================

function setLoadingState(loading) {
  const form = document.getElementById('register-form');
  const btn = document.getElementById('register-btn');

  if (loading) {
    form.classList.add('register-loading');
    btn.disabled = true;
    btn.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2"></span>
      Inscription en cours...
    `;
  } else {
    form.classList.remove('register-loading');
    btn.disabled = false;
    btn.innerHTML = `
      <i class="bi bi-person-plus"></i> S'inscrire
    `;
  }
}

function displayErrors(errors) {
  clearErrors();

  Object.entries(errors).forEach(([field, message]) => {
    const input = document.getElementById(`reg-${field}`) || document.getElementById(field);
    if (input) {
      input.classList.add('is-invalid');
      
      let feedback = input.nextElementSibling;
      if (!feedback || !feedback.classList.contains('invalid-feedback')) {
        feedback = document.createElement('div');
        feedback.className = 'invalid-feedback';
        input.parentNode.appendChild(feedback);
      }
      feedback.textContent = message;
    }
  });

  const errorDiv = document.getElementById('register-error');
  if (errorDiv) {
    errorDiv.innerHTML = `
      <i class="bi bi-exclamation-circle me-2"></i>
      <strong>Erreur:</strong> Veuillez corriger les champs en rouge
    `;
    errorDiv.style.display = 'block';
  }

  const firstError = document.querySelector('.is-invalid');
  if (firstError) {
    firstError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    firstError.focus();
  }
}

function clearErrors() {
  document.querySelectorAll('.is-invalid').forEach(el => {
    el.classList.remove('is-invalid');
  });
  
  document.querySelectorAll('.invalid-feedback').forEach(el => {
    el.remove();
  });

  const errorDiv = document.getElementById('register-error');
  if (errorDiv) errorDiv.style.display = 'none';
}

function showError(message) {
  const errorDiv = document.getElementById('register-error');
  if (errorDiv) {
    errorDiv.innerHTML = `
      <i class="bi bi-x-circle me-2"></i>
      <strong>Erreur:</strong> ${message}
    `;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  showToast(message, 'error');
}

function showSuccess(data, email) {
  const successDiv = document.getElementById('register-success');
  const form = document.getElementById('register-form');

  if (successDiv) {
    successDiv.innerHTML = `
      <div class="text-center">
        <i class="bi bi-check-circle-fill fs-1 text-success mb-3 d-block"></i>
        <h5 class="fw-bold mb-2">Inscription réussie !</h5>
        <p class="mb-3">Votre compte a été créé avec succès.</p>
        <div class="spinner-border spinner-border-sm text-pink me-2"></div>
        <small>Redirection vers votre profil...</small>
      </div>
    `;
    successDiv.style.display = 'block';
  }

  if (form) {
    form.style.display = 'none';
  }

  showToast('Inscription réussie ! Bienvenue chez Loedi Kids 🎉', 'success');

  localStorage.setItem('rememberEmail', email);
}

// ============================================
// MODAL CONDITIONS
// ============================================

function showTermsModal() {
  const modalElement = document.getElementById('termsModal');
  if (modalElement) {
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
  }
}

function acceptTerms() {
  const checkbox = document.getElementById('terms');
  if (checkbox) {
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
  }
  
  const modalElement = document.getElementById('termsModal');
  if (modalElement) {
    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) modal.hide();
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

function initEventListeners() {
  const form = document.getElementById('register-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  const nomInput = document.getElementById('reg-nom');
  if (nomInput) {
    nomInput.addEventListener('blur', () => {
      const validator = new FormValidator();
      validator.validateNom(nomInput.value);
      if (validator.errors.nom) {
        nomInput.classList.add('is-invalid');
        showFieldError(nomInput, validator.errors.nom);
      } else {
        nomInput.classList.remove('is-invalid');
        removeFieldError(nomInput);
      }
    });
  }

  const prenomInput = document.getElementById('reg-prenom');
  if (prenomInput) {
    prenomInput.addEventListener('blur', () => {
      const validator = new FormValidator();
      validator.validatePrenom(prenomInput.value);
      if (validator.errors.prenom) {
        prenomInput.classList.add('is-invalid');
        showFieldError(prenomInput, validator.errors.prenom);
      } else {
        prenomInput.classList.remove('is-invalid');
        removeFieldError(prenomInput);
      }
    });
  }

  const emailInput = document.getElementById('reg-email');
  if (emailInput) {
    emailInput.addEventListener('blur', () => {
      const validator = new FormValidator();
      validator.validateEmail(emailInput.value);
      if (validator.errors.email) {
        emailInput.classList.add('is-invalid');
        showFieldError(emailInput, validator.errors.email);
      } else {
        emailInput.classList.remove('is-invalid');
        removeFieldError(emailInput);
      }
    });
  }

  const passwordInput = document.getElementById('reg-password');
  if (passwordInput) {
    passwordInput.addEventListener('input', (e) => {
      updatePasswordStrength(e.target.value);
    });

    passwordInput.addEventListener('blur', () => {
      const validator = new FormValidator();
      validator.validatePassword(passwordInput.value);
      if (validator.errors.password) {
        passwordInput.classList.add('is-invalid');
        showFieldError(passwordInput, validator.errors.password);
      } else {
        passwordInput.classList.remove('is-invalid');
        removeFieldError(passwordInput);
      }
    });
  }

  const confirmPasswordInput = document.getElementById('reg-confirm-password');
  if (confirmPasswordInput) {
    confirmPasswordInput.addEventListener('input', (e) => {
      const password = document.getElementById('reg-password').value;
      const validator = new FormValidator();
      validator.validateConfirmPassword(password, e.target.value);
      
      if (validator.errors.confirmPassword) {
        confirmPasswordInput.classList.add('is-invalid');
        showFieldError(confirmPasswordInput, validator.errors.confirmPassword);
      } else {
        confirmPasswordInput.classList.remove('is-invalid');
        removeFieldError(confirmPasswordInput);
      }
    });
  }

  const termsCheckbox = document.getElementById('terms');
  if (termsCheckbox) {
    termsCheckbox.addEventListener('change', (e) => {
      if (e.target.checked) {
        e.target.classList.remove('is-invalid');
      }
    });
  }

  const togglePasswordBtns = document.querySelectorAll('[data-toggle-password]');
  togglePasswordBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const inputId = btn.getAttribute('data-toggle-password');
      const iconId = btn.querySelector('i').id;
      togglePasswordVisibility(inputId, iconId);
    });
  });
}

function showFieldError(input, message) {
  let feedback = input.nextElementSibling;
  if (!feedback || !feedback.classList.contains('invalid-feedback')) {
    feedback = document.createElement('div');
    feedback.className = 'invalid-feedback';
    input.parentNode.appendChild(feedback);
  }
  feedback.textContent = message;
}

function removeFieldError(input) {
  const feedback = input.nextElementSibling;
  if (feedback && feedback.classList.contains('invalid-feedback')) {
    feedback.remove();
  }
}

// ============================================
// UTILITAIRES
// ============================================

function prefillEmail() {
  const savedEmail = localStorage.getItem('rememberEmail');
  if (savedEmail) {
    const emailInput = document.getElementById('reg-email');
    if (emailInput) {
      emailInput.value = savedEmail;
    }
  }
}

function animateEntrance() {
  const card = document.querySelector('.card.card-gradient');
  if (card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
      card.style.transition = 'all 0.5s ease';
      card.style.opacity = '1';
      card.style.transform = 'translateY(0)';
    }, 100);
  }
}

function updateAuthIcon(href, icon, title) {
  const authIcon = document.getElementById('auth-icon');
  if (authIcon) {
    authIcon.href = href;
    authIcon.innerHTML = `<i class="bi bi-${icon} fs-4"></i>`;
    authIcon.title = title;
  }
}

function showToast(message, type = 'info') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: 'check-circle-fill',
    error: 'x-circle-fill',
    warning: 'exclamation-triangle-fill',
    info: 'info-circle-fill'
  };

  const colors = {
    success: 'success',
    error: 'danger',
    warning: 'warning',
    info: 'info'
  };

  const toast = document.createElement('div');
  toast.className = `toast align-items-center text-white bg-${colors[type]} border-0`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi bi-${icons[type]} me-2"></i>
        ${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>
  `;

  container.appendChild(toast);
  const bsToast = new bootstrap.Toast(toast, { delay: 4000 });
  bsToast.show();

  toast.addEventListener('hidden.bs.toast', () => toast.remove());
}

// ============================================
// EXPORTS ET INITIALISATION
// ============================================

window.showTermsModal = showTermsModal;
window.acceptTerms = acceptTerms;

document.addEventListener('DOMContentLoaded', initRegister);

export {
  initRegister,
  handleSubmit,
  updatePasswordStrength
};